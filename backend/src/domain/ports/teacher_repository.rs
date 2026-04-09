use async_trait::async_trait;

use crate::domain::{errors::DomainError, models::teacher::Teacher};

#[async_trait]
pub trait TeacherRepository: Send + Sync {
    async fn find_all(&self) -> Result<Vec<Teacher>, DomainError>;
    async fn find_by_id(&self, id: i32) -> Result<Option<Teacher>, DomainError>;
    async fn find_by_employee_number(&self, employee_number: &str) -> Result<Option<Teacher>, DomainError>;
    async fn find_by_email(&self, email: &str) -> Result<Option<Teacher>, DomainError>;
    async fn create(&self, employee_number: &str, name: &str, email: Option<&str>) -> Result<Teacher, DomainError>;
    async fn update(&self, id: i32, employee_number: Option<&str>, name: Option<&str>, email: Option<Option<&str>>) -> Result<Teacher, DomainError>;
    async fn delete(&self, id: i32) -> Result<bool, DomainError>;
}
