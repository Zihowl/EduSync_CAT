use async_trait::async_trait;
use chrono::Utc;
use uuid::Uuid;

use crate::domain::{errors::DomainError, models::user::User};

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_all(&self) -> Result<Vec<User>, DomainError>;
    #[allow(dead_code)]
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, DomainError>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError>;
    async fn create_admin(
        &self,
        email: &str,
        full_name: &str,
        password_hash: &str,
        is_super_admin: bool,
    ) -> Result<User, DomainError>;
    async fn increment_failed_login_attempts(&self, user_id: Uuid) -> Result<(), DomainError>;
    async fn reset_failed_login_attempts(&self, user_id: Uuid) -> Result<(), DomainError>;
    async fn set_lockout_until(&self, user_id: Uuid, until: Option<chrono::DateTime<Utc>>) -> Result<(), DomainError>;
    async fn set_is_active(&self, user_id: Uuid, is_active: bool) -> Result<User, DomainError>;
    async fn update_credentials(&self, user_id: Uuid, email: &str, password_hash: &str, is_temp_password: bool) -> Result<User, DomainError>;
}
