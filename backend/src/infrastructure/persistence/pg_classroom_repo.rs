use async_trait::async_trait;
use sqlx::{FromRow, PgPool};

use crate::domain::{
    errors::DomainError,
    models::classroom::Classroom,
    ports::classroom_repository::ClassroomRepository,
};

#[derive(Clone)]
pub struct PgClassroomRepository {
    pool: PgPool,
}

impl PgClassroomRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct ClassroomRow {
    id: i32,
    name: String,
    building_id: Option<i32>,
}

impl From<ClassroomRow> for Classroom {
    fn from(v: ClassroomRow) -> Self {
        Self {
            id: v.id,
            name: v.name,
            building_id: v.building_id,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("DB classrooms error: {e}"))
}

#[async_trait]
impl ClassroomRepository for PgClassroomRepository {
    async fn find_all(&self) -> Result<Vec<Classroom>, DomainError> {
        let rows = sqlx::query_as::<_, ClassroomRow>("SELECT id, name, building_id FROM classrooms ORDER BY id DESC")
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find_by_id(&self, id: i32) -> Result<Option<Classroom>, DomainError> {
        let row = sqlx::query_as::<_, ClassroomRow>("SELECT id, name, building_id FROM classrooms WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_by_name(&self, name: &str) -> Result<Option<Classroom>, DomainError> {
        let row = sqlx::query_as::<_, ClassroomRow>("SELECT id, name, building_id FROM classrooms WHERE name = $1")
            .bind(name)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn create(&self, name: &str, building_id: Option<i32>) -> Result<Classroom, DomainError> {
        let row = sqlx::query_as::<_, ClassroomRow>(
            "INSERT INTO classrooms (name, building_id) VALUES ($1, $2) RETURNING id, name, building_id",
        )
        .bind(name)
        .bind(building_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn update(&self, id: i32, name: Option<&str>, building_id: Option<Option<i32>>) -> Result<Classroom, DomainError> {
        let mut current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Classroom not found".to_string()))?;

        if let Some(v) = name {
            current.name = v.to_string();
        }
        if let Some(v) = building_id {
            current.building_id = v;
        }

        let row = sqlx::query_as::<_, ClassroomRow>(
            "UPDATE classrooms SET name = $1, building_id = $2 WHERE id = $3 RETURNING id, name, building_id",
        )
        .bind(&current.name)
        .bind(current.building_id)
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        let result = sqlx::query("DELETE FROM classrooms WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}
