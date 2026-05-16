use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::user_backup::UserBackup,
    ports::user_backup_repository::UserBackupRepository,
};

#[derive(Clone)]
pub struct PgUserBackupRepository {
    pool: PgPool,
}

impl PgUserBackupRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct UserBackupRow {
    user_id: Uuid,
    ciphertext: String,
    updated_at: DateTime<Utc>,
}

impl From<UserBackupRow> for UserBackup {
    fn from(v: UserBackupRow) -> Self {
        Self {
            user_id: v.user_id,
            ciphertext: v.ciphertext,
            updated_at: v.updated_at,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en respaldos de usuario: {e}"))
}

#[async_trait]
impl UserBackupRepository for PgUserBackupRepository {
    async fn upsert(
        &self,
        user_id: Uuid,
        ciphertext: &str,
    ) -> Result<UserBackup, DomainError> {
        let row = sqlx::query_as::<_, UserBackupRow>(
            "INSERT INTO user_backups (user_id, ciphertext, updated_at)
             VALUES ($1, $2, now())
             ON CONFLICT (user_id)
             DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = now()
             RETURNING user_id, ciphertext, updated_at",
        )
        .bind(user_id)
        .bind(ciphertext)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn find_by_user(&self, user_id: Uuid) -> Result<Option<UserBackup>, DomainError> {
        let row = sqlx::query_as::<_, UserBackupRow>(
            "SELECT user_id, ciphertext, updated_at FROM user_backups WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }
}
