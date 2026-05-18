use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::pending_registration::PendingRegistration,
    ports::pending_registration_repository::PendingRegistrationRepository,
    validation::normalize_email,
};

#[derive(Clone)]
pub struct PgPendingRegistrationRepository {
    pool: PgPool,
}

impl PgPendingRegistrationRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct PendingRow {
    id: Uuid,
    email: String,
    full_name: String,
    username: String,
    password_hash: String,
    verification_token: Uuid,
    verification_code: String,
    expires_at: DateTime<Utc>,
    attempts: i32,
    created_at: DateTime<Utc>,
}

impl From<PendingRow> for PendingRegistration {
    fn from(v: PendingRow) -> Self {
        Self {
            id: v.id,
            email: v.email,
            full_name: v.full_name,
            username: v.username,
            password_hash: v.password_hash,
            verification_token: v.verification_token,
            verification_code: v.verification_code,
            expires_at: v.expires_at,
            attempts: v.attempts,
            created_at: v.created_at,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en registros pendientes: {e}"))
}

#[async_trait]
impl PendingRegistrationRepository for PgPendingRegistrationRepository {
    async fn upsert(
        &self,
        email: &str,
        full_name: &str,
        username: &str,
        password_hash: &str,
        verification_token: Uuid,
        verification_code: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<PendingRegistration, DomainError> {
        let email = normalize_email(email);

        // Mantener un solo registro pendiente por correo: borrar previos.
        sqlx::query("DELETE FROM pending_registrations WHERE lower(email) = $1")
            .bind(&email)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;

        let row = sqlx::query_as::<_, PendingRow>(
            "INSERT INTO pending_registrations (email, full_name, username, password_hash, verification_token, verification_code, expires_at, attempts)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
             RETURNING id, email, full_name, username, password_hash, verification_token, verification_code, expires_at, attempts, created_at",
        )
        .bind(email)
        .bind(full_name)
        .bind(username)
        .bind(password_hash)
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
    ) -> Result<Option<PendingRegistration>, DomainError> {
        let row = sqlx::query_as::<_, PendingRow>(
            "SELECT id, email, full_name, username, password_hash, verification_token, verification_code, expires_at, attempts, created_at
             FROM pending_registrations WHERE verification_token = $1",
        )
        .bind(token)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn increment_attempts(&self, id: Uuid) -> Result<i32, DomainError> {
        let row: (i32,) = sqlx::query_as(
            "UPDATE pending_registrations SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.0)
    }

    async fn delete(&self, id: Uuid) -> Result<(), DomainError> {
        sqlx::query("DELETE FROM pending_registrations WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(())
    }
}
