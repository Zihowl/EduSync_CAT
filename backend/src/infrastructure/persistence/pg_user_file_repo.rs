use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::user_file::UserFile,
    ports::user_file_repository::UserFileRepository,
};

#[derive(Clone)]
pub struct PgUserFileRepository {
    pool: PgPool,
}

impl PgUserFileRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct UserFileRow {
    user_id: Uuid,
    file_uuid: String,
    ciphertext: String,
    file_name: String,
    file_size: i64,
    updated_at: DateTime<Utc>,
    deleted_at: Option<DateTime<Utc>>,
}

impl From<UserFileRow> for UserFile {
    fn from(v: UserFileRow) -> Self {
        Self {
            user_id: v.user_id,
            file_uuid: v.file_uuid,
            ciphertext: v.ciphertext,
            file_name: v.file_name,
            file_size: v.file_size,
            updated_at: v.updated_at,
            deleted_at: v.deleted_at,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en archivos de usuario: {e}"))
}

const COLUMNS: &str =
    "user_id, file_uuid, ciphertext, file_name, file_size, updated_at, deleted_at";

#[async_trait]
impl UserFileRepository for PgUserFileRepository {
    async fn upsert(
        &self,
        user_id: Uuid,
        file_uuid: &str,
        ciphertext: &str,
        file_name: &str,
        file_size: i64,
    ) -> Result<UserFile, DomainError> {
        let row = sqlx::query_as::<_, UserFileRow>(
            "INSERT INTO user_files
                 (user_id, file_uuid, ciphertext, file_name, file_size, updated_at, deleted_at)
             VALUES ($1, $2, $3, $4, $5, now(), NULL)
             ON CONFLICT (user_id, file_uuid)
             DO UPDATE SET ciphertext = EXCLUDED.ciphertext,
                           file_name  = EXCLUDED.file_name,
                           file_size  = EXCLUDED.file_size,
                           updated_at = now(),
                           deleted_at = NULL
             RETURNING user_id, file_uuid, ciphertext, file_name, file_size, updated_at, deleted_at",
        )
        .bind(user_id)
        .bind(file_uuid)
        .bind(ciphertext)
        .bind(file_name)
        .bind(file_size)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn soft_delete(
        &self,
        user_id: Uuid,
        file_uuid: &str,
    ) -> Result<bool, DomainError> {
        let result = sqlx::query(
            "UPDATE user_files SET deleted_at = now(), updated_at = now()
             WHERE user_id = $1 AND file_uuid = $2",
        )
        .bind(user_id)
        .bind(file_uuid)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }

    async fn list_for_user(&self, user_id: Uuid) -> Result<Vec<UserFile>, DomainError> {
        let rows = sqlx::query_as::<_, UserFileRow>(&format!(
            "SELECT {COLUMNS} FROM user_files WHERE user_id = $1 ORDER BY updated_at"
        ))
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find(
        &self,
        user_id: Uuid,
        file_uuid: &str,
    ) -> Result<Option<UserFile>, DomainError> {
        let row = sqlx::query_as::<_, UserFileRow>(&format!(
            "SELECT {COLUMNS} FROM user_files WHERE user_id = $1 AND file_uuid = $2"
        ))
        .bind(user_id)
        .bind(file_uuid)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }
}
