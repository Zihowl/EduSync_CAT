use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::teacher::Teacher,
    ports::teacher_repository::TeacherRepository,
};

#[derive(Clone)]
pub struct TeacherService {
    repo: Arc<dyn TeacherRepository>,
}

impl TeacherService {
    pub fn new(repo: Arc<dyn TeacherRepository>) -> Self {
        Self { repo }
    }

    pub async fn find_all(&self) -> Result<Vec<Teacher>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Teacher>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn create(&self, employee_number: &str, name: &str, email: Option<&str>) -> Result<Teacher, DomainError> {
        if self.repo.find_by_employee_number(employee_number).await?.is_some() {
            return Err(DomainError::Conflict("El numero de empleado ya existe".to_string()));
        }
        self.repo.create(employee_number, name, email).await
    }

    pub async fn update(
        &self,
        id: i32,
        employee_number: Option<&str>,
        name: Option<&str>,
        email: Option<Option<&str>>,
    ) -> Result<Teacher, DomainError> {
        self.repo.update(id, employee_number, name, email).await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }
}
