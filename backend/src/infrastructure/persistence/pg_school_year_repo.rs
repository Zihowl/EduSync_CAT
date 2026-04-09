use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};

use crate::domain::{
    errors::DomainError,
    models::school_year::SchoolYear,
    ports::school_year_repository::SchoolYearRepository,
};

#[derive(Clone)]
pub struct PgSchoolYearRepository {
    pool: PgPool,
}

impl PgSchoolYearRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct SchoolYearRow {
    id: i32,
    start_date: chrono::NaiveDate,
    end_date: chrono::NaiveDate,
    created_at: DateTime<Utc>,
}

impl From<SchoolYearRow> for SchoolYear {
    fn from(v: SchoolYearRow) -> Self {
        Self {
            id: v.id,
            start_date: v.start_date.format("%Y-%m-%d").to_string(),
            end_date: v.end_date.format("%Y-%m-%d").to_string(),
            created_at: v.created_at,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en ciclos escolares: {e}"))
}

#[async_trait]
impl SchoolYearRepository for PgSchoolYearRepository {
    async fn get_current(&self) -> Result<Option<SchoolYear>, DomainError> {
        let row = sqlx::query_as::<_, SchoolYearRow>(
            "SELECT id, start_date, end_date, created_at FROM school_years ORDER BY created_at DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn set_current(&self, start_date: &str, end_date: &str) -> Result<SchoolYear, DomainError> {
        if let Some(current) = self.get_current().await? {
            let row = sqlx::query_as::<_, SchoolYearRow>(
                "UPDATE school_years
                  SET start_date = $1::date, end_date = $2::date, created_at = NOW()
                 WHERE id = $3
                 RETURNING id, start_date, end_date, created_at",
            )
            .bind(start_date)
            .bind(end_date)
            .bind(current.id)
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx)?;
            return Ok(row.into());
        }

        let row = sqlx::query_as::<_, SchoolYearRow>(
            "INSERT INTO school_years (start_date, end_date)
             VALUES ($1::date, $2::date)
             RETURNING id, start_date, end_date, created_at",
        )
        .bind(start_date)
        .bind(end_date)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }
}
