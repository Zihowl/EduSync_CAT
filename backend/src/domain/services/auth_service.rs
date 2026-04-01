use std::sync::Arc;

use argon2::{Argon2, password_hash::{PasswordHash, PasswordHasher, SaltString, rand_core::OsRng}, PasswordVerifier};
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
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub user: User,
}

fn is_valid_email(email: &str) -> bool {
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 {
        return false;
    }
    let domain = parts[1];
    domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
}

fn password_meets_complexity(password: &str) -> bool {
    let mut categories = 0;
    if password.chars().any(|c| c.is_ascii_lowercase()) {
        categories += 1;
    }
    if password.chars().any(|c| c.is_ascii_uppercase()) {
        categories += 1;
    }
    if password.chars().any(|c| c.is_ascii_digit()) {
        categories += 1;
    }
    if password.chars().any(|c| "!@#$%^&*()-_=+[]{}<>?".contains(c)) {
        categories += 1;
    }
    categories >= 3
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

        if user.is_temp_password {
            return Err(DomainError::Unauthorized("Contraseña temporal. Cambia tu contraseña antes de continuar".to_string()));
        }

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
            refresh_token: None,
            expires_in: self.jwt_expires_in_secs,
            user,
        })
    }

    pub async fn change_credentials(
        &self,
        current_email: &str,
        current_password: &str,
        new_email: &str,
        new_password: &str,
    ) -> Result<User, DomainError> {
        let current_email = current_email.trim();
        let current_password = current_password.trim();
        let new_email = new_email.trim();
        let new_password = new_password.trim();

        if current_email.is_empty() || current_password.is_empty() {
            return Err(DomainError::BadRequest("Correo y contraseña actual son requeridos".to_string()));
        }

        if new_email.is_empty() || new_password.is_empty() {
            return Err(DomainError::BadRequest("Correo y nueva contraseña son requeridos".to_string()));
        }

        let user = self
            .repo
            .find_by_email(current_email)
            .await?
            .ok_or_else(|| DomainError::Unauthorized("Credenciales invalidas".to_string()))?;

        if !user.is_active {
            return Err(DomainError::Unauthorized("Cuenta inactiva".to_string()));
        }

        let parsed = PasswordHash::new(&user.password_hash)
            .map_err(|_| DomainError::Unauthorized("Credenciales invalidas".to_string()))?;

        if Argon2::default().verify_password(current_password.as_bytes(), &parsed).is_err() {
            return Err(DomainError::Unauthorized("Credenciales invalidas".to_string()));
        }

        if !is_valid_email(new_email) {
            return Err(DomainError::BadRequest("Nuevo correo invalido".to_string()));
        }

        if new_email.ends_with("@setup.local") {
            return Err(DomainError::BadRequest("El dominio @setup.local no está permitido".to_string()));
        }

        if new_email != current_email {
            if self.repo.find_by_email(new_email).await?.is_some() {
                return Err(DomainError::Conflict("El correo ya esta registrado".to_string()));
            }
        }

        if new_password.len() < 8 {
            return Err(DomainError::BadRequest("La contraseña debe tener al menos 8 caracteres".to_string()));
        }

        if !password_meets_complexity(new_password) {
            return Err(DomainError::BadRequest("La contraseña debe incluir al menos 3 de 4 categorias: mayusculas, minusculas, numeros y simbolos".to_string()));
        }

        let mut rng = OsRng;
        let new_password_hash = Argon2::default()
            .hash_password(new_password.as_bytes(), &SaltString::generate(&mut rng))
            .map_err(|e| DomainError::Internal(format!("No se pudo hashear contraseña: {e}")))?
            .to_string();

        if new_password_hash == user.password_hash {
            return Err(DomainError::BadRequest("La nueva contraseña no puede ser igual a la actual".to_string()));
        }

        let updated_user = self
            .repo
            .update_credentials(user.id, new_email, &new_password_hash, false)
            .await?;

        Ok(updated_user)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::errors::DomainError;
    use crate::domain::models::user::{User, UserRole};
    use crate::domain::ports::user_repository::UserRepository;
    use argon2::{password_hash::{PasswordHasher, SaltString}, Argon2};
    use async_trait::async_trait;
    use chrono::{Duration, Utc};
    use std::sync::Mutex;
    use uuid::Uuid;

    struct MockUserRepository {
        user: Mutex<User>,
    }

    impl MockUserRepository {
        fn new(user: User) -> Self {
            Self {
                user: Mutex::new(user),
            }
        }
    }

    #[async_trait]
    impl UserRepository for MockUserRepository {
        async fn find_all(&self) -> Result<Vec<User>, DomainError> {
            let user = self.user.lock().unwrap().clone();
            Ok(vec![user])
        }

        async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, DomainError> {
            let user = self.user.lock().unwrap().clone();
            if user.id == id {
                Ok(Some(user))
            } else {
                Ok(None)
            }
        }

        async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError> {
            let user = self.user.lock().unwrap().clone();
            if user.email == email {
                Ok(Some(user))
            } else {
                Ok(None)
            }
        }

        async fn create_admin(
            &self,
            _email: &str,
            _full_name: &str,
            _password_hash: &str,
            _is_super_admin: bool,
        ) -> Result<User, DomainError> {
            Err(DomainError::Internal("create_admin not implemented".into()))
        }

        async fn increment_failed_login_attempts(&self, user_id: Uuid) -> Result<(), DomainError> {
            let mut user = self.user.lock().unwrap();
            if user.id == user_id {
                user.failed_login_attempts += 1;
                Ok(())
            } else {
                Err(DomainError::NotFound("User not found".into()))
            }
        }

        async fn reset_failed_login_attempts(&self, user_id: Uuid) -> Result<(), DomainError> {
            let mut user = self.user.lock().unwrap();
            if user.id == user_id {
                user.failed_login_attempts = 0;
                user.lockout_until = None;
                Ok(())
            } else {
                Err(DomainError::NotFound("User not found".into()))
            }
        }

        async fn set_lockout_until(
            &self,
            user_id: Uuid,
            until: Option<chrono::DateTime<Utc>>,
        ) -> Result<(), DomainError> {
            let mut user = self.user.lock().unwrap();
            if user.id == user_id {
                user.lockout_until = until;
                Ok(())
            } else {
                Err(DomainError::NotFound("User not found".into()))
            }
        }

        async fn update_credentials(&self, user_id: Uuid, email: &str, password_hash: &str, is_temp_password: bool) -> Result<User, DomainError> {
            let mut user = self.user.lock().unwrap();
            if user.id == user_id {
                user.email = email.to_string();
                user.password_hash = password_hash.to_string();
                user.is_temp_password = is_temp_password;
                user.updated_at = Utc::now();
                Ok(user.clone())
            } else {
                Err(DomainError::NotFound("User not found".into()))
            }
        }
    }

    async fn setup_auth_service() -> (AuthService, std::sync::Arc<MockUserRepository>) {
        let password = "CorrectHorseBatteryStaple";
        let salt = SaltString::from_b64("1234567890123456").unwrap();
        let hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .unwrap()
            .to_string();

        let user = User {
            id: Uuid::new_v4(),
            email: "admin@example.com".to_string(),
            full_name: Some("Admin".to_string()),
            password_hash: hash,
            role: UserRole::SuperAdmin,
            is_active: true,
            is_temp_password: false,
            failed_login_attempts: 0,
            lockout_until: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let repo = std::sync::Arc::new(MockUserRepository::new(user));
        let svc = AuthService::new(repo.clone(), "secret".to_string(), 3600);
        (svc, repo)
    }

    #[tokio::test]
    async fn test_lockout_increments_and_resets() {
        let (auth_service, repo) = setup_auth_service().await;

        // First two invalid attempts should not trigger lockout.
        for _ in 0..2 {
            let res = auth_service.validate_user("admin@example.com", "wrong password").await;
            assert!(matches!(res, Err(DomainError::Unauthorized(_))));
        }

        let user_after_two = repo.find_by_email("admin@example.com").await.unwrap().unwrap();
        assert_eq!(user_after_two.failed_login_attempts, 2);
        assert!(user_after_two.lockout_until.is_none());

        // Third invalid attempt triggers 15s lockout.
        let res3 = auth_service.validate_user("admin@example.com", "wrong password").await;
        assert!(matches!(res3, Err(DomainError::Unauthorized(msg)) if msg.contains("Cuenta bloqueada temporalmente")));

        let user_after_three = repo.find_by_email("admin@example.com").await.unwrap().unwrap();
        assert!(user_after_three.failed_login_attempts >= 3);
        assert!(user_after_three.lockout_until.is_some());

        // If lockout is in effect, login with correct password is blocked.
        let res_locked = auth_service.validate_user("admin@example.com", "CorrectHorseBatteryStaple").await;
        assert!(matches!(res_locked, Err(DomainError::Unauthorized(msg)) if msg.contains("Cuenta bloqueada temporalmente")));

        // Force unlock and test successful login resets counters.
        repo.set_lockout_until(user_after_three.id, Some(Utc::now() - Duration::seconds(1))).await.unwrap();
        let success = auth_service.validate_user("admin@example.com", "CorrectHorseBatteryStaple").await;
        assert!(success.is_ok());

        let user_after_success = repo.find_by_email("admin@example.com").await.unwrap().unwrap();
        assert_eq!(user_after_success.failed_login_attempts, 0);
        assert!(user_after_success.lockout_until.is_none());
    }

    #[tokio::test]
    async fn test_temp_password_prevents_jwt_login() {
        let (auth_service, repo) = setup_auth_service().await;

        // Mark this user as having temporary password in repo state.
        {
            let mut user = repo.user.lock().unwrap();
            user.is_temp_password = true;
        }

        let result = auth_service.validate_user("admin@example.com", "CorrectHorseBatteryStaple").await;

        assert!(matches!(result, Err(DomainError::Unauthorized(msg)) if msg.contains("temporal")));
    }

    #[tokio::test]
    async fn test_change_credentials_transitions_from_temp_password() {
        let (auth_service, repo) = setup_auth_service().await;

        {
            let mut user = repo.user.lock().unwrap();
            user.is_temp_password = true;
        }

        let result = auth_service
            .change_credentials(
                "admin@example.com",
                "CorrectHorseBatteryStaple",
                "admin2@example.com",
                "NewStrongPass1!",
            )
            .await;

        assert!(result.is_ok());
        let updated_user = result.unwrap();

        assert_eq!(updated_user.email, "admin2@example.com");
        assert!(!updated_user.is_temp_password);

        let validate = auth_service
            .validate_user("admin2@example.com", "NewStrongPass1!")
            .await;
        assert!(validate.is_ok());

        let login_result = auth_service.login(validate.unwrap()).unwrap();
        assert!(!login_result.access_token.is_empty());
    }
}

