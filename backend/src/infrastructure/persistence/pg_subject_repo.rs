use async_trait::async_trait;
use sqlx::{FromRow, PgPool};

use crate::domain::{
    errors::DomainError, models::subject::Subject, ports::subject_repository::SubjectRepository,
};

#[derive(Clone)]
pub struct PgSubjectRepository {
    pool: PgPool,
}

impl PgSubjectRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct SubjectRow {
    id: i32,
    code: String,
    name: String,
    grade: Option<i32>,
    division: Option<String>,
}

impl From<SubjectRow> for Subject {
    fn from(v: SubjectRow) -> Self {
        Self {
            id: v.id,
            code: v.code,
            name: v.name,
            grade: v.grade,
            division: v.division,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en materias: {e}"))
}

#[async_trait]
impl SubjectRepository for PgSubjectRepository {
    async fn find_all(&self) -> Result<Vec<Subject>, DomainError> {
        let rows = sqlx::query_as::<_, SubjectRow>(
            "SELECT id, code, name, grade, division FROM subjects ORDER BY id DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find_by_id(&self, id: i32) -> Result<Option<Subject>, DomainError> {
        let row = sqlx::query_as::<_, SubjectRow>(
            "SELECT id, code, name, grade, division FROM subjects WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_by_code(&self, code: &str) -> Result<Option<Subject>, DomainError> {
        let row = sqlx::query_as::<_, SubjectRow>(
            "SELECT id, code, name, grade, division FROM subjects WHERE code = $1",
        )
        .bind(code)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn create(
        &self,
        code: &str,
        name: &str,
        grade: Option<i32>,
        division: Option<&str>,
    ) -> Result<Subject, DomainError> {
        let row = sqlx::query_as::<_, SubjectRow>(
            "INSERT INTO subjects (code, name, grade, division) VALUES ($1, $2, $3, $4) RETURNING id, code, name, grade, division",
        )
        .bind(code)
        .bind(name)
        .bind(grade)
        .bind(division)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn update(
        &self,
        id: i32,
        code: Option<&str>,
        name: Option<&str>,
        grade: Option<i32>,
        division: Option<&str>,
    ) -> Result<Subject, DomainError> {
        let mut current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Materia no encontrada".to_string()))?;

        if let Some(v) = code {
            current.code = v.to_string();
        }
        if let Some(v) = name {
            current.name = v.to_string();
        }
        if let Some(v) = grade {
            current.grade = Some(v);
        }
        if let Some(v) = division {
            current.division = Some(v.to_string());
        }

        let row = sqlx::query_as::<_, SubjectRow>(
            "UPDATE subjects SET code = $1, name = $2, grade = $3, division = $4 WHERE id = $5 RETURNING id, code, name, grade, division",
        )
        .bind(&current.code)
        .bind(&current.name)
        .bind(current.grade)
        .bind(current.division.as_deref())
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        let result = sqlx::query("DELETE FROM subjects WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}
