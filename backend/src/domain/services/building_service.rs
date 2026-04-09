use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::building::Building,
    ports::building_repository::BuildingRepository,
    validation::{normalize_optional_text, normalize_required_text},
};

#[derive(Clone)]
pub struct BuildingService {
    repo: Arc<dyn BuildingRepository>,
}

impl BuildingService {
    pub fn new(repo: Arc<dyn BuildingRepository>) -> Self {
        Self { repo }
    }

    pub async fn find_all(&self) -> Result<Vec<Building>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Building>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn find_by_name(&self, name: &str) -> Result<Option<Building>, DomainError> {
        self.repo.find_by_name(name).await
    }

    pub async fn create(&self, name: &str, description: Option<&str>) -> Result<Building, DomainError> {
        let name = normalize_required_text("Nombre del edificio", name)?;
        let description = normalize_optional_text(description);

        if self.repo.find_by_name(&name).await?.is_some() {
            return Err(DomainError::Conflict("El edificio ya existe".to_string()));
        }
        self.repo.create(&name, description.as_deref()).await
    }

    pub async fn update(&self, id: i32, name: Option<&str>, description: Option<Option<&str>>) -> Result<Building, DomainError> {
        let mut current = self
            .repo
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Edificio no encontrado".to_string()))?;

        if let Some(name) = name {
            let name = normalize_required_text("Nombre del edificio", name)?;
            if name != current.name {
                if let Some(existing) = self.repo.find_by_name(&name).await? {
                    if existing.id != id {
                        return Err(DomainError::Conflict("El edificio ya existe".to_string()));
                    }
                }
            }
            current.name = name;
        }

        if let Some(description) = description {
            current.description = normalize_optional_text(description);
        }

        self.repo
            .update(id, Some(&current.name), Some(current.description.as_deref()))
            .await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }
}
