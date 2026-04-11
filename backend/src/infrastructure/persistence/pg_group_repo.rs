use async_trait::async_trait;
use sqlx::{FromRow, PgPool};

use crate::domain::{
    errors::DomainError, models::group::Group, ports::group_repository::GroupRepository,
};

#[derive(Clone)]
pub struct PgGroupRepository {
    pool: PgPool,
}

impl PgGroupRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct GroupRow {
    id: i32,
    name: String,
    parent_id: Option<i32>,
    grade: Option<i32>,
}

impl From<GroupRow> for Group {
    fn from(v: GroupRow) -> Self {
        Self {
            id: v.id,
            name: v.name,
            parent_id: v.parent_id,
            grade: v.grade,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en grupos: {e}"))
}

#[async_trait]
impl GroupRepository for PgGroupRepository {
    async fn find_all(&self) -> Result<Vec<Group>, DomainError> {
        let rows = sqlx::query_as::<_, GroupRow>(
            "SELECT id, name, parent_id, grade FROM \"groups\" ORDER BY id DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find_by_id(&self, id: i32) -> Result<Option<Group>, DomainError> {
        let row = sqlx::query_as::<_, GroupRow>(
            "SELECT id, name, parent_id, grade FROM \"groups\" WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_by_name_and_parent(
        &self,
        name: &str,
        parent_id: Option<i32>,
    ) -> Result<Option<Group>, DomainError> {
        let row = sqlx::query_as::<_, GroupRow>(
            "SELECT id, name, parent_id, grade FROM \"groups\" WHERE name = $1 AND parent_id IS NOT DISTINCT FROM $2",
        )
            .bind(name)
            .bind(parent_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn create(&self, name: &str, parent_id: Option<i32>, grade: Option<i32>) -> Result<Group, DomainError> {
        let row = sqlx::query_as::<_, GroupRow>(
            "INSERT INTO \"groups\" (name, parent_id, grade) VALUES ($1, $2, $3) RETURNING id, name, parent_id, grade",
        )
        .bind(name)
        .bind(parent_id)
        .bind(grade)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn update(
        &self,
        id: i32,
        name: Option<&str>,
        parent_id: Option<Option<i32>>,
        grade: Option<Option<i32>>,
    ) -> Result<Group, DomainError> {
        let mut current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Grupo no encontrado".to_string()))?;

        if let Some(v) = name {
            current.name = v.to_string();
        }
        if let Some(v) = parent_id {
            current.parent_id = v;
        }
        if let Some(v) = grade {
            current.grade = v;
        }

        let row = sqlx::query_as::<_, GroupRow>(
            "UPDATE \"groups\" SET name = $1, parent_id = $2, grade = $3 WHERE id = $4 RETURNING id, name, parent_id, grade",
        )
        .bind(&current.name)
        .bind(current.parent_id)
        .bind(current.grade)
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        let result = sqlx::query("DELETE FROM \"groups\" WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}
