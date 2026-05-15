use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::password_reset::PasswordReset,
    ports::password_reset_repository::PasswordResetRepository,
    validation::normalize_email,
};

#[derive(Clone)]
pub struct PgPasswordResetRepository {
    pool: PgPool,
}

impl PgPasswordResetRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct PasswordResetRow {
    id: Uuid,
    email: String,
    verification_token: Uuid,
    verification_code: String,
    expires_at: DateTime<Utc>,
    attempts: i32,
    code_verified: bool,
    created_at: DateTime<Utc>,
}

impl From<PasswordResetRow> for PasswordReset {
    fn from(v: PasswordResetRow) -> Self {
        Self {
            id: v.id,
            email: v.email,
            verification_token: v.verification_token,
            verification_code: v.verification_code,
            expires_at: v.expires_at,
            attempts: v.attempts,
            code_verified: v.code_verified,
            created_at: v.created_at,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!(
        "Error de base de datos en restablecimientos de contraseña: {e}"
    ))
}

#[async_trait]
impl PasswordResetRepository for PgPasswordResetRepository {
    async fn upsert(
        &self,
        email: &str,
        verification_token: Uuid,
        verification_code: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<PasswordReset, DomainError> {
        let email = normalize_email(email);

        // Mantener una sola solicitud pendiente por correo: borrar previas.
        sqlx::query("DELETE FROM password_resets WHERE lower(email) = $1")
            .bind(&email)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;

        let row = sqlx::query_as::<_, PasswordResetRow>(
            "INSERT INTO password_resets (email, verification_token, verification_code, expires_at, attempts, code_verified)
             VALUES ($1, $2, $3, $4, 0, FALSE)
             RETURNING id, email, verification_token, verification_code, expires_at, attempts, code_verified, created_at",
        )
        .bind(email)
        .bind(verification_token)
        .bind(verification_code)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn find_by_token(
        &self,
        token: Uuid,
    ) -> Result<Option<PasswordReset>, DomainError> {
        let row = sqlx::query_as::<_, PasswordResetRow>(
            "SELECT id, email, verification_token, verification_code, expires_at, attempts, code_verified, created_at
             FROM password_resets WHERE verification_token = $1",
        )
        .bind(token)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn increment_attempts(&self, id: Uuid) -> Result<i32, DomainError> {
        let row: (i32,) = sqlx::query_as(
            "UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.0)
    }

    async fn mark_code_verified(&self, id: Uuid) -> Result<(), DomainError> {
        sqlx::query("UPDATE password_resets SET code_verified = TRUE WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(())
    }

    async fn delete(&self, id: Uuid) -> Result<(), DomainError> {
        sqlx::query("DELETE FROM password_resets WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(())
    }
}
