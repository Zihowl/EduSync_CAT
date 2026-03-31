use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::group::Group,
    ports::group_repository::GroupRepository,
};

#[derive(Clone)]
pub struct GroupService {
    repo: Arc<dyn GroupRepository>,
}

impl GroupService {
    pub fn new(repo: Arc<dyn GroupRepository>) -> Self {
        Self { repo }
    }

    pub async fn find_all(&self) -> Result<Vec<Group>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Group>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn create(&self, name: &str, parent_id: Option<i32>) -> Result<Group, DomainError> {
        if self.repo.find_by_name(name).await?.is_some() {
            return Err(DomainError::Conflict("El grupo ya existe".to_string()));
        }
        self.repo.create(name, parent_id).await
    }

    pub async fn update(&self, id: i32, name: Option<&str>, parent_id: Option<Option<i32>>) -> Result<Group, DomainError> {
        self.repo.update(id, name, parent_id).await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }
}
