use async_trait::async_trait;

use crate::domain::{errors::DomainError, models::allowed_domain::AllowedDomain};

#[async_trait]
pub trait AllowedDomainRepository: Send + Sync {
    async fn find_all(&self) -> Result<Vec<AllowedDomain>, DomainError>;
    async fn find_by_domain(&self, domain: &str) -> Result<Option<AllowedDomain>, DomainError>;
    async fn create(&self, domain: &str) -> Result<AllowedDomain, DomainError>;
    async fn delete(&self, id: i32) -> Result<bool, DomainError>;
}
