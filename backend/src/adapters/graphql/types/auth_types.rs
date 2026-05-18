use async_graphql::SimpleObject;

use super::user_type::UserType;

#[derive(SimpleObject, Clone)]
pub struct LoginResponseType {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub user: UserType,
}

#[derive(SimpleObject, Clone)]
pub struct RegisterResponseType {
    pub verification_token: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(SimpleObject, Clone)]
pub struct PasswordResetResponseType {
    pub verification_token: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(SimpleObject, Clone)]
pub struct VerifyEmailResponseType {
    pub access_token: String,
    pub expires_in: i64,
    pub user: UserType,
}

/// Perfil de registro de un correo: si pertenece a un docente del catálogo
/// CAT, `is_teacher` es `true` y `suggested_full_name` trae el nombre
/// institucional (no editable por el usuario).
#[derive(SimpleObject, Clone)]
pub struct RegistrationProfileType {
    pub is_teacher: bool,
    pub suggested_full_name: Option<String>,
}
