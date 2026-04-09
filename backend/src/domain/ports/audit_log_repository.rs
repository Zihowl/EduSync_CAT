use async_trait::async_trait;

use crate::domain::{
    errors::DomainError,
    models::audit_log::{AuditLog, AuditLogFilter, AuditLogPage, NewAuditLog},
};

#[async_trait]
pub trait AuditLogRepository: Send + Sync {
    async fn create(&self, entry: NewAuditLog) -> Result<AuditLog, DomainError>;
    async fn find_page(&self, filter: AuditLogFilter) -> Result<AuditLogPage, DomainError>;
    async fn delete_older_than_months(&self, months: i32) -> Result<u64, DomainError>;
}