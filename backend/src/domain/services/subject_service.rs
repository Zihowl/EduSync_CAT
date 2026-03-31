use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::subject::Subject,
    ports::subject_repository::SubjectRepository,
};

#[derive(Clone)]
pub struct SubjectService {
    repo: Arc<dyn SubjectRepository>,
}

impl SubjectService {
    pub fn new(repo: Arc<dyn SubjectRepository>) -> Self {
        Self { repo }
    }

    pub async fn find_all(&self) -> Result<Vec<Subject>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Subject>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn create(&self, code: &str, name: &str) -> Result<Subject, DomainError> {
        if self.repo.find_by_code(code).await?.is_some() {
            return Err(DomainError::Conflict("El codigo de materia ya existe".to_string()));
        }
        self.repo.create(code, name).await
    }

    pub async fn update(&self, id: i32, code: Option<&str>, name: Option<&str>) -> Result<Subject, DomainError> {
        self.repo.update(id, code, name).await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }
}
