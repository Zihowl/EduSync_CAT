use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::domain::{errors::DomainError, models::password_reset::PasswordReset};

#[async_trait]
pub trait PasswordResetRepository: Send + Sync {
    async fn upsert(
        &self,
        email: &str,
        verification_token: Uuid,
        verification_code: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<PasswordReset, DomainError>;

    async fn find_by_token(
        &self,
        token: Uuid,
    ) -> Result<Option<PasswordReset>, DomainError>;

    async fn increment_attempts(&self, id: Uuid) -> Result<i32, DomainError>;

    async fn mark_code_verified(&self, id: Uuid) -> Result<(), DomainError>;

    async fn delete(&self, id: Uuid) -> Result<(), DomainError>;
}
