use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::models::password_reset::PasswordReset;
use crate::Result;

#[async_trait]
pub trait PasswordResetRepository: Send + Sync {
    async fn upsert(&self, reset: PasswordReset) -> Result<()>;
    async fn find_by_token(&self, token: Uuid) -> Result<Option<PasswordReset>>;
    async fn mark_verified(&self, token: Uuid) -> Result<()>;
    async fn delete(&self, token: Uuid) -> Result<()>;
    async fn increment_attempts(&self, token: Uuid) -> Result<()>;
}
