use async_trait::async_trait;
use sqlx::{FromRow, PgPool};

use crate::domain::{
    errors::DomainError, models::building::Building, ports::building_repository::BuildingRepository,
};

#[derive(Clone)]
pub struct PgBuildingRepository {
    pool: PgPool,
}

impl PgBuildingRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct BuildingRow {
    id: i32,
    name: String,
    description: Option<String>,
}

impl From<BuildingRow> for Building {
    fn from(v: BuildingRow) -> Self {
        Self {
            id: v.id,
            name: v.name,
            description: v.description,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en edificios: {e}"))
}

#[async_trait]
impl BuildingRepository for PgBuildingRepository {
    async fn find_all(&self) -> Result<Vec<Building>, DomainError> {
        let rows = sqlx::query_as::<_, BuildingRow>(
            "SELECT id, name, description FROM buildings ORDER BY id DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find_by_id(&self, id: i32) -> Result<Option<Building>, DomainError> {
        let row = sqlx::query_as::<_, BuildingRow>(
            "SELECT id, name, description FROM buildings WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_by_name(&self, name: &str) -> Result<Option<Building>, DomainError> {
        let row = sqlx::query_as::<_, BuildingRow>(
            "SELECT id, name, description FROM buildings WHERE name = $1",
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn create(&self, name: &str, description: Option<&str>) -> Result<Building, DomainError> {
        let row = sqlx::query_as::<_, BuildingRow>(
            "INSERT INTO buildings (name, description) VALUES ($1, $2) RETURNING id, name, description",
        )
        .bind(name)
        .bind(description)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn update(
        &self,
        id: i32,
        name: Option<&str>,
        description: Option<Option<&str>>,
    ) -> Result<Building, DomainError> {
        let mut current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Edificio no encontrado".to_string()))?;

        if let Some(v) = name {
            current.name = v.to_string();
        }
        if let Some(v) = description {
            current.description = v.map(|x| x.to_string());
        }

        let row = sqlx::query_as::<_, BuildingRow>(
            "UPDATE buildings SET name = $1, description = $2 WHERE id = $3 RETURNING id, name, description",
        )
        .bind(&current.name)
        .bind(&current.description)
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        let result = sqlx::query("DELETE FROM buildings WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}
