use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::building::Building,
    ports::building_repository::BuildingRepository,
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

    pub async fn create(&self, name: &str, description: Option<&str>) -> Result<Building, DomainError> {
        if self.repo.find_by_name(name).await?.is_some() {
            return Err(DomainError::Conflict("El edificio ya existe".to_string()));
        }
        self.repo.create(name, description).await
    }

    pub async fn update(&self, id: i32, name: Option<&str>, description: Option<Option<&str>>) -> Result<Building, DomainError> {
        self.repo.update(id, name, description).await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }
}
