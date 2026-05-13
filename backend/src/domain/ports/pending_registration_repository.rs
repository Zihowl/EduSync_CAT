use async_trait::async_trait;
use chrono::{DateTime, Utc};
use uuid::Uuid;

use crate::domain::{errors::DomainError, models::pending_registration::PendingRegistration};

#[async_trait]
pub trait PendingRegistrationRepository: Send + Sync {
    async fn upsert(
        &self,
        email: &str,
        password_hash: &str,
        verification_token: Uuid,
        verification_code: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<PendingRegistration, DomainError>;

    async fn find_by_token(
        &self,
        token: Uuid,
    ) -> Result<Option<PendingRegistration>, DomainError>;

    async fn increment_attempts(&self, id: Uuid) -> Result<i32, DomainError>;

    async fn delete(&self, id: Uuid) -> Result<(), DomainError>;
}
