use std::sync::Arc;

use argon2::{Argon2, PasswordHash, PasswordVerifier};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};

use crate::domain::{
    errors::DomainError,
    models::user::User,
    ports::user_repository::UserRepository,
};

#[derive(Clone)]
pub struct AuthService {
    repo: Arc<dyn UserRepository>,
    jwt_secret: String,
    jwt_expires_in_secs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub role: String,
    pub exp: i64,
}

#[derive(Clone)]
pub struct LoginResult {
    pub access_token: String,
    pub user: User,
}

impl AuthService {
    pub fn new(repo: Arc<dyn UserRepository>, jwt_secret: String, jwt_expires_in_secs: i64) -> Self {
        Self {
            repo,
            jwt_secret,
            jwt_expires_in_secs,
        }
    }

    pub async fn validate_user(&self, email: &str, password: &str) -> Result<User, DomainError> {
        let user = self
            .repo
            .find_by_email(email)
            .await?
            .ok_or_else(|| DomainError::Unauthorized("Credenciales invalidas".to_string()))?;

        let parsed = PasswordHash::new(&user.password_hash)
            .map_err(|_| DomainError::Unauthorized("Credenciales invalidas".to_string()))?;
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .map_err(|_| DomainError::Unauthorized("Credenciales invalidas".to_string()))?;

        Ok(user)
    }

    pub fn login(&self, user: User) -> Result<LoginResult, DomainError> {
        let exp = (Utc::now() + Duration::seconds(self.jwt_expires_in_secs)).timestamp();
        let claims = Claims {
            sub: user.id.to_string(),
            email: user.email.clone(),
            role: user.role.as_str().to_string(),
            exp,
        };

        let token = encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )
        .map_err(|e| DomainError::Internal(format!("No se pudo firmar JWT: {e}")))?;

        Ok(LoginResult {
            access_token: token,
            user,
        })
    }
}
