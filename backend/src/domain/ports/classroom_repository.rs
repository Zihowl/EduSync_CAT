use async_trait::async_trait;

use crate::domain::{errors::DomainError, models::classroom::Classroom};

#[async_trait]
pub trait ClassroomRepository: Send + Sync {
    async fn find_all(&self) -> Result<Vec<Classroom>, DomainError>;
    async fn find_by_id(&self, id: i32) -> Result<Option<Classroom>, DomainError>;
    async fn find_by_name(&self, name: &str) -> Result<Option<Classroom>, DomainError>;
    async fn find_by_name_and_building(&self, name: &str, building_id: i32) -> Result<Option<Classroom>, DomainError>;
    async fn create(&self, name: &str, building_id: Option<i32>) -> Result<Classroom, DomainError>;
    async fn update(&self, id: i32, name: Option<&str>, building_id: Option<Option<i32>>) -> Result<Classroom, DomainError>;
    async fn delete(&self, id: i32) -> Result<bool, DomainError>;
}
