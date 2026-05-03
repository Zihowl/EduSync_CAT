use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::user::{User, UserRole},
    ports::user_repository::UserRepository,
    validation::normalize_email,
};
use crate::infrastructure::crypto::KeyStore;

#[derive(Clone)]
pub struct PgUserRepository {
    pool: PgPool,
    keystore: Arc<KeyStore>,
}

impl PgUserRepository {
    pub fn new(pool: PgPool, keystore: Arc<KeyStore>) -> Self {
        Self { pool, keystore }
    }

    fn decrypt_hash(&self, stored: String) -> Result<String, DomainError> {
        self.keystore.decrypt_secret(&stored).map_err(|e| {
            DomainError::Internal(format!("No se pudo descifrar el hash de contraseña: {e}"))
        })
    }

    fn encrypt_hash(&self, plain_hash: &str) -> Result<String, DomainError> {
        self.keystore.encrypt_secret(plain_hash.as_bytes()).map_err(|e| {
            DomainError::Internal(format!("No se pudo cifrar el hash de contraseña: {e}"))
        })
    }

    fn map_user(&self, row: UserRow) -> Result<User, DomainError> {
        let plain_hash = self.decrypt_hash(row.password_hash)?;
        Ok(User {
            id: row.id,
            email: row.email.to_ascii_lowercase(),
            full_name: row.full_name,
            password_hash: plain_hash,
            role: UserRole::from_str(&row.role),
            is_active: row.is_active,
            is_temp_password: row.is_temp_password,
            failed_login_attempts: row.failed_login_attempts,
            lockout_until: row.lockout_until,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Recorre la tabla y vuelve a guardar todo `password_hash` que aún no esté
    /// cifrado con la llave actual. Idempotente.
    pub async fn backfill_encrypted_hashes(&self) -> Result<usize, DomainError> {
        let rows = sqlx::query_as::<_, (Uuid, String)>(
            "SELECT id, password_hash FROM users",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;

        let mut updated = 0usize;
        for (id, stored) in rows {
            if KeyStore::is_encrypted(&stored) {
                continue;
            }
            let blob = self.encrypt_hash(&stored)?;
            sqlx::query("UPDATE users SET password_hash = $2 WHERE id = $1")
                .bind(id)
                .bind(blob)
                .execute(&self.pool)
                .await
                .map_err(map_sqlx)?;
            updated += 1;
        }
        Ok(updated)
    }
}

#[derive(FromRow)]
struct UserRow {
    id: Uuid,
    email: String,
    full_name: Option<String>,
    password_hash: String,
    role: String,
    is_active: bool,
    is_temp_password: bool,
    failed_login_attempts: i32,
    lockout_until: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en usuarios: {e}"))
}

#[async_trait]
impl UserRepository for PgUserRepository {
    async fn find_all(&self) -> Result<Vec<User>, DomainError> {
        let rows = sqlx::query_as::<_, UserRow>(
            "SELECT id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, failed_login_attempts, lockout_until, created_at, updated_at FROM users ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        rows.into_iter().map(|r| self.map_user(r)).collect()
    }

    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, DomainError> {
        let row = sqlx::query_as::<_, UserRow>(
            "SELECT id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, failed_login_attempts, lockout_until, created_at, updated_at FROM users WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        row.map(|r| self.map_user(r)).transpose()
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError> {
        let email = normalize_email(email);
        let row = sqlx::query_as::<_, UserRow>(
            "SELECT id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, failed_login_attempts, lockout_until, created_at, updated_at FROM users WHERE lower(email) = $1",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        row.map(|r| self.map_user(r)).transpose()
    }

    async fn has_active_user_with_domain(&self, domain: &str) -> Result<bool, DomainError> {
        let domain = domain.trim().to_ascii_lowercase();
        if domain.is_empty() {
            return Ok(false);
        }

        let exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (
                SELECT 1
                FROM users
                WHERE is_active = TRUE
                  AND split_part(lower(email), '@', 2) = $1
            )",
        )
        .bind(domain)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(exists)
    }

    async fn create_admin(
        &self,
        email: &str,
        full_name: &str,
        password_hash: &str,
        is_super_admin: bool,
    ) -> Result<User, DomainError> {
        let email = normalize_email(email);
        let role = if is_super_admin {
            "SUPER_ADMIN"
        } else {
            "ADMIN_HORARIOS"
        };

        let encrypted = self.encrypt_hash(password_hash)?;
        let row = sqlx::query_as::<_, UserRow>(
            "INSERT INTO users (email, full_name, password_hash, role, is_active, is_temp_password, failed_login_attempts, lockout_until)
             VALUES ($1, $2, $3, $4::user_role, TRUE, TRUE, 0, NULL)
             RETURNING id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, failed_login_attempts, lockout_until, created_at, updated_at",
        )
        .bind(email)
        .bind(full_name)
        .bind(encrypted)
        .bind(role)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        self.map_user(row)
    }

    async fn increment_failed_login_attempts(&self, user_id: Uuid) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1",
        )
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn reset_failed_login_attempts(&self, user_id: Uuid) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = $1",
        )
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn set_lockout_until(
        &self,
        user_id: Uuid,
        until: Option<DateTime<Utc>>,
    ) -> Result<(), DomainError> {
        sqlx::query("UPDATE users SET lockout_until = $2 WHERE id = $1")
            .bind(user_id)
            .bind(until)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(())
    }

    async fn set_is_active(&self, user_id: Uuid, is_active: bool) -> Result<User, DomainError> {
        let row = sqlx::query_as::<_, UserRow>(
            "UPDATE users
             SET is_active = $2,
                 failed_login_attempts = 0,
                 lockout_until = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, failed_login_attempts, lockout_until, created_at, updated_at",
        )
        .bind(user_id)
        .bind(is_active)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        self.map_user(row)
    }

    async fn update_credentials(
        &self,
        user_id: Uuid,
        email: &str,
        password_hash: &str,
        is_temp_password: bool,
    ) -> Result<User, DomainError> {
        let email = normalize_email(email);
        let encrypted = self.encrypt_hash(password_hash)?;
        let row = sqlx::query_as::<_, UserRow>(
            "UPDATE users
             SET email = $2,
                 password_hash = $3,
                 is_temp_password = $4,
                 failed_login_attempts = 0,
                 lockout_until = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, failed_login_attempts, lockout_until, created_at, updated_at",
        )
        .bind(user_id)
        .bind(email)
        .bind(encrypted)
        .bind(is_temp_password)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        self.map_user(row)
    }
}
