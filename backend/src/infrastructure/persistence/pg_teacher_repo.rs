use async_trait::async_trait;
use sqlx::{FromRow, PgPool};

use crate::domain::{
    errors::DomainError, models::teacher::Teacher, ports::teacher_repository::TeacherRepository,
    validation::normalize_email,
};

#[derive(Clone)]
pub struct PgTeacherRepository {
    pool: PgPool,
}

impl PgTeacherRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct TeacherRow {
    id: i32,
    employee_number: String,
    name: String,
    email: Option<String>,
}

impl From<TeacherRow> for Teacher {
    fn from(v: TeacherRow) -> Self {
        Self {
            id: v.id,
            employee_number: v.employee_number,
            name: v.name,
            email: v.email.map(|email| email.to_ascii_lowercase()),
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en docentes: {e}"))
}

#[async_trait]
impl TeacherRepository for PgTeacherRepository {
    async fn find_all(&self) -> Result<Vec<Teacher>, DomainError> {
        let rows = sqlx::query_as::<_, TeacherRow>(
            "SELECT id, employee_number, name, email FROM teachers ORDER BY id DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find_by_id(&self, id: i32) -> Result<Option<Teacher>, DomainError> {
        let row = sqlx::query_as::<_, TeacherRow>(
            "SELECT id, employee_number, name, email FROM teachers WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_by_employee_number(
        &self,
        employee_number: &str,
    ) -> Result<Option<Teacher>, DomainError> {
        let row = sqlx::query_as::<_, TeacherRow>(
            "SELECT id, employee_number, name, email FROM teachers WHERE employee_number = $1",
        )
        .bind(employee_number)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<Teacher>, DomainError> {
        let email = normalize_email(email);
        let row = sqlx::query_as::<_, TeacherRow>(
            "SELECT id, employee_number, name, email FROM teachers WHERE lower(email) = $1",
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn create(
        &self,
        employee_number: &str,
        name: &str,
        email: Option<&str>,
    ) -> Result<Teacher, DomainError> {
        let email = email.map(normalize_email);
        let row = sqlx::query_as::<_, TeacherRow>(
            "INSERT INTO teachers (employee_number, name, email)
             VALUES ($1, $2, $3)
             RETURNING id, employee_number, name, email",
        )
        .bind(employee_number)
        .bind(name)
        .bind(email)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn update(
        &self,
        id: i32,
        employee_number: Option<&str>,
        name: Option<&str>,
        email: Option<Option<&str>>,
    ) -> Result<Teacher, DomainError> {
        let mut current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Docente no encontrado".to_string()))?;

        if let Some(v) = employee_number {
            current.employee_number = v.to_string();
        }
        if let Some(v) = name {
            current.name = v.to_string();
        }
        if let Some(v) = email {
            current.email = v.map(normalize_email);
        }

        let row = sqlx::query_as::<_, TeacherRow>(
            "UPDATE teachers
             SET employee_number = $1, name = $2, email = $3
             WHERE id = $4
             RETURNING id, employee_number, name, email",
        )
        .bind(&current.employee_number)
        .bind(&current.name)
        .bind(&current.email)
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        let result = sqlx::query("DELETE FROM teachers WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}
