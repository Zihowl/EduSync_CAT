use async_trait::async_trait;

use crate::domain::{errors::DomainError, models::subject::Subject};

#[async_trait]
pub trait SubjectRepository: Send + Sync {
    async fn find_all(&self) -> Result<Vec<Subject>, DomainError>;
    async fn find_by_id(&self, id: i32) -> Result<Option<Subject>, DomainError>;
    async fn find_by_code(&self, code: &str) -> Result<Option<Subject>, DomainError>;
    async fn create(
        &self,
        code: &str,
        name: &str,
        grade: Option<i32>,
        division: Option<&str>,
    ) -> Result<Subject, DomainError>;
    async fn update(
        &self,
        id: i32,
        code: Option<&str>,
        name: Option<&str>,
        grade: Option<i32>,
        division: Option<&str>,
    ) -> Result<Subject, DomainError>;
    async fn delete(&self, id: i32) -> Result<bool, DomainError>;
}
