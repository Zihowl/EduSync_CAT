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

/// Lista de columnas compartida por todos los `SELECT`/`RETURNING` de usuarios.
const USER_COLUMNS: &str = "id, email, username, full_name, password_hash, role::text AS role, is_active, is_temp_password, failed_login_attempts, lockout_until, created_at, updated_at";

#[derive(Clone)]
pub struct PgUserRepository {
    pool: PgPool,
}

impl PgUserRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct UserRow {
    id: Uuid,
    email: String,
    username: String,
    full_name: String,
    password_hash: String,
    role: String,
    is_active: bool,
    is_temp_password: bool,
    failed_login_attempts: i32,
    lockout_until: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<UserRow> for User {
    fn from(v: UserRow) -> Self {
        Self {
            id: v.id,
            email: v.email.to_ascii_lowercase(),
            username: v.username,
            full_name: v.full_name,
            password_hash: v.password_hash,
            role: UserRole::from_str(&v.role),
            is_active: v.is_active,
            is_temp_password: v.is_temp_password,
            failed_login_attempts: v.failed_login_attempts,
            lockout_until: v.lockout_until,
            created_at: v.created_at,
            updated_at: v.updated_at,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en usuarios: {e}"))
}

#[async_trait]
impl UserRepository for PgUserRepository {
    async fn find_all(&self) -> Result<Vec<User>, DomainError> {
        let rows = sqlx::query_as::<_, UserRow>(&format!(
            "SELECT {USER_COLUMNS} FROM users ORDER BY created_at DESC"
        ))
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, DomainError> {
        let row = sqlx::query_as::<_, UserRow>(&format!(
            "SELECT {USER_COLUMNS} FROM users WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError> {
        let email = normalize_email(email);
        let row = sqlx::query_as::<_, UserRow>(&format!(
            "SELECT {USER_COLUMNS} FROM users WHERE lower(email) = $1"
        ))
        .bind(email)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_by_username(&self, username: &str) -> Result<Option<User>, DomainError> {
        let username = username.trim().to_ascii_lowercase();
        if username.is_empty() {
            return Ok(None);
        }
        let row = sqlx::query_as::<_, UserRow>(&format!(
            "SELECT {USER_COLUMNS} FROM users WHERE lower(username) = $1"
        ))
        .bind(username)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
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
        username: &str,
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

        let row = sqlx::query_as::<_, UserRow>(&format!(
            "INSERT INTO users (email, username, full_name, password_hash, role, is_active, is_temp_password, failed_login_attempts, lockout_until)
             VALUES ($1, $2, $3, $4, $5::user_role, TRUE, TRUE, 0, NULL)
             RETURNING {USER_COLUMNS}"
        ))
        .bind(email)
        .bind(username)
        .bind(full_name)
        .bind(password_hash)
        .bind(role)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn create_user_with_role(
        &self,
        email: &str,
        username: &str,
        full_name: &str,
        password_hash: &str,
        role: &str,
    ) -> Result<User, DomainError> {
        let email = normalize_email(email);
        let row = sqlx::query_as::<_, UserRow>(&format!(
            "INSERT INTO users (email, username, full_name, password_hash, role, is_active, is_temp_password, failed_login_attempts, lockout_until)
             VALUES ($1, $2, $3, $4, $5::user_role, TRUE, FALSE, 0, NULL)
             RETURNING {USER_COLUMNS}"
        ))
        .bind(email)
        .bind(username)
        .bind(full_name)
        .bind(password_hash)
        .bind(role)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
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
        let row = sqlx::query_as::<_, UserRow>(&format!(
            "UPDATE users
             SET is_active = $2,
                 failed_login_attempts = 0,
                 lockout_until = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING {USER_COLUMNS}"
        ))
        .bind(user_id)
        .bind(is_active)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn update_credentials(
        &self,
        user_id: Uuid,
        email: &str,
        password_hash: &str,
        is_temp_password: bool,
    ) -> Result<User, DomainError> {
        let email = normalize_email(email);
        let row = sqlx::query_as::<_, UserRow>(&format!(
            "UPDATE users
             SET email = $2,
                 password_hash = $3,
                 is_temp_password = $4,
                 failed_login_attempts = 0,
                 lockout_until = NULL,
                 tokens_invalid_before = NOW(),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING {USER_COLUMNS}"
        ))
        .bind(user_id)
        .bind(email)
        .bind(password_hash)
        .bind(is_temp_password)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn tokens_invalid_before(
        &self,
        user_id: Uuid,
    ) -> Result<Option<DateTime<Utc>>, DomainError> {
        let ts = sqlx::query_scalar::<_, Option<DateTime<Utc>>>(
            "SELECT tokens_invalid_before FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(ts.flatten())
    }

    async fn update_role(&self, user_id: Uuid, role: &str) -> Result<User, DomainError> {
        let row = sqlx::query_as::<_, UserRow>(&format!(
            "UPDATE users
             SET role = $2::user_role,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING {USER_COLUMNS}"
        ))
        .bind(user_id)
        .bind(role)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }
}
