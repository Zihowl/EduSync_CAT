use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::user::{User, UserRole},
    ports::user_repository::UserRepository,
};

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
    full_name: Option<String>,
    password_hash: String,
    role: String,
    is_active: bool,
    is_temp_password: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<UserRow> for User {
    fn from(v: UserRow) -> Self {
        Self {
            id: v.id,
            email: v.email,
            full_name: v.full_name,
            password_hash: v.password_hash,
            role: UserRole::from_str(&v.role),
            is_active: v.is_active,
            is_temp_password: v.is_temp_password,
            created_at: v.created_at,
            updated_at: v.updated_at,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("DB users error: {e}"))
}

#[async_trait]
impl UserRepository for PgUserRepository {
    async fn find_all(&self) -> Result<Vec<User>, DomainError> {
        let rows = sqlx::query_as::<_, UserRow>(
            "SELECT id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, created_at, updated_at FROM users ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, DomainError> {
        let row = sqlx::query_as::<_, UserRow>(
            "SELECT id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, created_at, updated_at FROM users WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError> {
        let row = sqlx::query_as::<_, UserRow>(
            "SELECT id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, created_at, updated_at FROM users WHERE email = $1",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn create_admin(
        &self,
        email: &str,
        full_name: &str,
        password_hash: &str,
        is_super_admin: bool,
    ) -> Result<User, DomainError> {
        let role = if is_super_admin {
            "SUPER_ADMIN"
        } else {
            "ADMIN_HORARIOS"
        };

        let row = sqlx::query_as::<_, UserRow>(
            "INSERT INTO users (email, full_name, password_hash, role, is_active, is_temp_password)
             VALUES ($1, $2, $3, $4::user_role, TRUE, TRUE)
             RETURNING id, email, full_name, password_hash, role::text AS role, is_active, is_temp_password, created_at, updated_at",
        )
        .bind(email)
        .bind(full_name)
        .bind(password_hash)
        .bind(role)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn count_all(&self) -> Result<i64, DomainError> {
        let total: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM users")
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(total.0)
    }
}
