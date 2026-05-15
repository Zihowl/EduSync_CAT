use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Solicitud de restablecimiento de contraseña pendiente de completar.
#[derive(Clone, Debug)]
pub struct PasswordReset {
    pub id: Uuid,
    pub email: String,
    pub verification_token: Uuid,
    pub verification_code: String,
    pub expires_at: DateTime<Utc>,
    pub attempts: i32,
    pub code_verified: bool,
    pub created_at: DateTime<Utc>,
}
