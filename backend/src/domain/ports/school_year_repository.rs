use async_trait::async_trait;

use crate::domain::{errors::DomainError, models::school_year::SchoolYear};

#[async_trait]
pub trait SchoolYearRepository: Send + Sync {
    async fn get_current(&self) -> Result<Option<SchoolYear>, DomainError>;
    async fn set_current(&self, start_date: &str, end_date: &str) -> Result<SchoolYear, DomainError>;
}
