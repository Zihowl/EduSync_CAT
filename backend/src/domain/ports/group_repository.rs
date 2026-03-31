use async_trait::async_trait;

use crate::domain::{errors::DomainError, models::group::Group};

#[async_trait]
pub trait GroupRepository: Send + Sync {
    async fn find_all(&self) -> Result<Vec<Group>, DomainError>;
    async fn find_by_id(&self, id: i32) -> Result<Option<Group>, DomainError>;
    async fn find_by_name(&self, name: &str) -> Result<Option<Group>, DomainError>;
    async fn create(&self, name: &str, parent_id: Option<i32>) -> Result<Group, DomainError>;
    async fn update(&self, id: i32, name: Option<&str>, parent_id: Option<Option<i32>>) -> Result<Group, DomainError>;
    async fn delete(&self, id: i32) -> Result<bool, DomainError>;
}
