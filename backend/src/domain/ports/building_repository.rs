use async_trait::async_trait;

use crate::domain::{errors::DomainError, models::building::Building};

#[async_trait]
pub trait BuildingRepository: Send + Sync {
    async fn find_all(&self) -> Result<Vec<Building>, DomainError>;
    async fn find_by_id(&self, id: i32) -> Result<Option<Building>, DomainError>;
    async fn find_by_name(&self, name: &str) -> Result<Option<Building>, DomainError>;
    async fn create(&self, name: &str, description: Option<&str>) -> Result<Building, DomainError>;
    async fn update(
        &self,
        id: i32,
        name: Option<&str>,
        description: Option<Option<&str>>,
    ) -> Result<Building, DomainError>;
    async fn delete(&self, id: i32) -> Result<bool, DomainError>;
}
