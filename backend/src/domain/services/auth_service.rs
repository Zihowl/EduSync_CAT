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
        let normalized_email = email.trim();
        if normalized_email.is_empty() {
            return Err(DomainError::BadRequest("Email es requerido".to_string()));
        }

        if password.trim().is_empty() {
            return Err(DomainError::BadRequest("Password es requerido".to_string()));
        }

        let user = self
            .repo
            .find_by_email(normalized_email)
            .await?
            .ok_or_else(|| DomainError::Unauthorized("Credenciales invalidas".to_string()))?;

        if !user.is_active {
            return Err(DomainError::Unauthorized("Cuenta inactiva".to_string()));
        }

        if let Some(lockout_until) = user.lockout_until {
            if lockout_until > Utc::now() {
                let remaining = lockout_until.signed_duration_since(Utc::now()).num_seconds().max(0);
                return Err(DomainError::Unauthorized(format!(
                    "Cuenta bloqueada temporalmente. Intenta de nuevo en {} segundos",
                    remaining
                )));
            }
        }

        let parsed = PasswordHash::new(&user.password_hash)
            .map_err(|_| DomainError::Unauthorized("Credenciales invalidas".to_string()))?;

        if let Err(_) = Argon2::default().verify_password(password.as_bytes(), &parsed) {
            self.repo.increment_failed_login_attempts(user.id).await?;

            let updated_user = self
                .repo
                .find_by_id(user.id)
                .await?
                .ok_or_else(|| DomainError::Internal("Usuario no encontrado tras intento fallido".to_string()))?;

            let attempts = updated_user.failed_login_attempts;
            let lockout_seconds = match attempts {
                0..=2 => 0,
                3 => 15,
                4 => 30,
                _ => 60,
            };

            if lockout_seconds > 0 {
                let until = Utc::now() + Duration::seconds(lockout_seconds);
                self.repo.set_lockout_until(user.id, Some(until)).await?;
                return Err(DomainError::Unauthorized(format!(
                    "Cuenta bloqueada temporalmente. Intenta de nuevo en {} segundos",
                    lockout_seconds
                )));
            }

            return Err(DomainError::Unauthorized("Credenciales invalidas".to_string()));
        }

        self.repo.reset_failed_login_attempts(user.id).await?;
        self.repo.set_lockout_until(user.id, None).await?;

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
