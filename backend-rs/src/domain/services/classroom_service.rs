use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::classroom::Classroom,
    ports::classroom_repository::ClassroomRepository,
};

#[derive(Clone)]
pub struct ClassroomService {
    repo: Arc<dyn ClassroomRepository>,
}

impl ClassroomService {
    pub fn new(repo: Arc<dyn ClassroomRepository>) -> Self {
        Self { repo }
    }

    pub async fn find_all(&self) -> Result<Vec<Classroom>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Classroom>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn create(&self, name: &str, building_id: Option<i32>) -> Result<Classroom, DomainError> {
        if self.repo.find_by_name(name).await?.is_some() {
            return Err(DomainError::Conflict("El salon ya existe".to_string()));
        }
        self.repo.create(name, building_id).await
    }

    pub async fn update(&self, id: i32, name: Option<&str>, building_id: Option<Option<i32>>) -> Result<Classroom, DomainError> {
        self.repo.update(id, name, building_id).await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }
}
