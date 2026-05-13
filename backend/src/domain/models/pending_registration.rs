use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct PendingRegistration {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub verification_token: Uuid,
    pub verification_code: String,
    pub expires_at: DateTime<Utc>,
    pub attempts: i32,
    pub created_at: DateTime<Utc>,
}
