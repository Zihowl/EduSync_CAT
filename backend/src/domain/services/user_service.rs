use std::sync::Arc;

use argon2::password_hash::rand_core::OsRng;
use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use chrono::Utc;
use rand::{distr::Alphanumeric, prelude::{IndexedRandom, SliceRandom}, RngExt};
use regex::Regex;
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::user::User,
    ports::{
        allowed_domain_repository::AllowedDomainRepository,
        user_repository::UserRepository,
    },
    validation::normalize_email,
};

#[derive(Clone)]
pub struct UserService {
    repo: Arc<dyn UserRepository>,
    allowed_domain_repo: Arc<dyn AllowedDomainRepository>,
}

impl UserService {
    pub fn new(repo: Arc<dyn UserRepository>, allowed_domain_repo: Arc<dyn AllowedDomainRepository>) -> Self {
        Self {
            repo,
            allowed_domain_repo,
        }
    }

    pub async fn find_all(&self) -> Result<Vec<User>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, DomainError> {
        self.repo.find_by_id(id).await
    }

    #[allow(dead_code)]
    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError> {
        let email = normalize_email(email);
        self.repo.find_by_email(&email).await
    }

    pub async fn create_admin(&self, email: &str, full_name: &str) -> Result<(User, String), DomainError> {
        let email = normalize_email(email);
        self.ensure_email_format(&email)?;
        self.ensure_domain_allowed(&email).await?;

        if self.repo.find_by_email(&email).await?.is_some() {
            return Err(DomainError::Conflict("El correo ya está registrado".to_string()));
        }

        let temp_password = self.generate_temp_password(16)?;
        let hash = self.hash_password(&temp_password)?;
        let user = self
            .repo
            .create_admin(&email, full_name, &hash, false)
            .await?;

        tracing::info!(
            "SIMULACIÓN EMAIL -> to={} temp_password={} (forzar cambio en primer login)",
            email,
            temp_password
        );

        Ok((user, temp_password))
    }

    pub async fn disable_admin_access(&self, actor_user_id: Uuid, target_user_id: Uuid) -> Result<User, DomainError> {
        self.toggle_admin_access(actor_user_id, target_user_id, false).await
    }

    pub async fn reactivate_admin_access(&self, actor_user_id: Uuid, target_user_id: Uuid) -> Result<User, DomainError> {
        self.toggle_admin_access(actor_user_id, target_user_id, true).await
    }

    pub async fn force_reset_admin_password(&self, actor_user_id: Uuid, target_user_id: Uuid) -> Result<(User, String), DomainError> {
        let target_user = self.ensure_manageable_admin(target_user_id).await?;
        let temp_password = self.generate_temp_password(16)?;
        let hash = self.hash_password(&temp_password)?;

        let updated_user = self
            .repo
            .update_credentials(target_user.id, &target_user.email, &hash, true)
            .await?;

        tracing::info!(
            target_email = %updated_user.email,
            temp_password = %temp_password,
            action = "force_reset_admin_password",
            "SIMULACIÓN EMAIL -> restablecimiento forzado con contraseña temporal"
        );

        tracing::warn!(
            actor_user_id = %actor_user_id,
            target_user_id = %target_user.id,
            target_email = %updated_user.email,
            timestamp = %Utc::now().to_rfc3339(),
            action = "force_reset_admin_password",
            "AUDITORÍA: restablecimiento forzado de contraseña de administrador"
        );

        Ok((updated_user, temp_password))
    }

    async fn toggle_admin_access(&self, actor_user_id: Uuid, target_user_id: Uuid, is_active: bool) -> Result<User, DomainError> {
        if !is_active && actor_user_id == target_user_id {
            return Err(DomainError::BadRequest("No puedes inhabilitar tu propia cuenta".to_string()));
        }

        let target_user = self.ensure_manageable_admin(target_user_id).await?;

        if target_user.is_active == is_active {
            let message = if is_active {
                "La cuenta ya está habilitada"
            } else {
                "La cuenta ya está inhabilitada"
            };

            return Err(DomainError::Conflict(message.to_string()));
        }

        let updated_user = self.repo.set_is_active(target_user.id, is_active).await?;

        tracing::warn!(
            actor_user_id = %actor_user_id,
            target_user_id = %target_user.id,
            target_email = %updated_user.email,
            active = is_active,
            timestamp = %Utc::now().to_rfc3339(),
            action = if is_active { "reactivate_admin_access" } else { "disable_admin_access" },
            "AUDITORÍA: cambio de acceso de administrador"
        );

        Ok(updated_user)
    }

    async fn ensure_manageable_admin(&self, user_id: Uuid) -> Result<User, DomainError> {
        let user = self
            .repo
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Usuario no encontrado".to_string()))?;

        if user.role != crate::domain::models::user::UserRole::AdminHorarios {
            return Err(DomainError::BadRequest(
                "Solo se pueden gestionar cuentas de Administrador de Horarios".to_string(),
            ));
        }

        Ok(user)
    }

    fn ensure_email_format(&self, email: &str) -> Result<(), DomainError> {
        let re = Regex::new(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")
            .map_err(|e| DomainError::Internal(format!("Regex inválida: {e}")))?;
        if !re.is_match(email) {
            return Err(DomainError::BadRequest("Correo electrónico inválido".to_string()));
        }
        Ok(())
    }

    async fn ensure_domain_allowed(&self, email: &str) -> Result<(), DomainError> {
        let domain = email
            .split('@')
            .nth(1)
            .ok_or_else(|| DomainError::BadRequest("Correo electrónico inválido".to_string()))?;
        let allowed = self.allowed_domain_repo.find_all().await?;
        if !allowed.iter().any(|d| d.domain.eq_ignore_ascii_case(domain)) {
            return Err(DomainError::BadRequest(format!(
                "El dominio @{domain} no está permitido"
            )));
        }
        Ok(())
    }

    fn hash_password(&self, password: &str) -> Result<String, DomainError> {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
                .map_err(|e| DomainError::Internal(format!("No se pudo generar el hash de la contraseña: {e}")))
    }

    fn generate_temp_password(&self, length: usize) -> Result<String, DomainError> {
        if length < 4 {
            return Err(DomainError::BadRequest("Longitud de contraseña inválida".to_string()));
        }
        let upper = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let lower = b"abcdefghijklmnopqrstuvwxyz";
        let nums = b"0123456789";
        let symbols = b"!@#$%^&*()-_=+[]{}<>?";

        let mut rng = rand::rng();
        let mut chars = vec![
            *upper.choose(&mut rng).unwrap() as char,
            *lower.choose(&mut rng).unwrap() as char,
            *nums.choose(&mut rng).unwrap() as char,
            *symbols.choose(&mut rng).unwrap() as char,
        ];

        let random_tail: String = std::iter::repeat_with(|| rng.sample(Alphanumeric))
            .take(length.saturating_sub(4))
            .map(char::from)
            .collect();
        chars.extend(random_tail.chars());
        chars.shuffle(&mut rng);
        Ok(chars.into_iter().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::models::allowed_domain::AllowedDomain;
    use crate::domain::models::user::UserRole;
    use crate::domain::ports::{allowed_domain_repository::AllowedDomainRepository, user_repository::UserRepository};
    use argon2::{password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString}, Argon2};
    use async_trait::async_trait;
    use chrono::Utc;
    use std::sync::{Arc, Mutex};
    use uuid::Uuid;

    const TEST_PASSWORD: &str = "CorrectHorseBatteryStaple1!";

    struct MockAllowedDomainRepository;

    #[async_trait]
    impl AllowedDomainRepository for MockAllowedDomainRepository {
        async fn find_all(&self) -> Result<Vec<AllowedDomain>, DomainError> {
            Ok(vec![AllowedDomain { id: 1, domain: "example.com".to_string() }])
        }

        async fn find_by_domain(&self, _domain: &str) -> Result<Option<AllowedDomain>, DomainError> {
            Ok(Some(AllowedDomain { id: 1, domain: "example.com".to_string() }))
        }

        async fn create(&self, domain: &str) -> Result<AllowedDomain, DomainError> {
            Ok(AllowedDomain { id: 1, domain: domain.to_string() })
        }

        async fn delete(&self, _id: i32) -> Result<bool, DomainError> {
            Ok(false)
        }
    }

    struct MockUserRepository {
        user: Mutex<User>,
    }

    impl MockUserRepository {
        fn new(user: User) -> Self {
            Self { user: Mutex::new(user) }
        }
    }

    #[async_trait]
    impl UserRepository for MockUserRepository {
        async fn find_all(&self) -> Result<Vec<User>, DomainError> {
            Ok(vec![self.user.lock().unwrap().clone()])
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
            email: &str,
            full_name: &str,
            password_hash: &str,
            is_super_admin: bool,
        ) -> Result<User, DomainError> {
            let mut user = self.user.lock().unwrap().clone();
            user.email = email.to_string();
            user.full_name = Some(full_name.to_string());
            user.password_hash = password_hash.to_string();
            user.role = if is_super_admin {
                UserRole::SuperAdmin
            } else {
                UserRole::AdminHorarios
            };
            user.is_temp_password = true;
            user.failed_login_attempts = 0;
            user.lockout_until = None;
            user.updated_at = Utc::now();
            Ok(user)
        }

        async fn increment_failed_login_attempts(&self, user_id: Uuid) -> Result<(), DomainError> {
            let mut user = self.user.lock().unwrap();
            if user.id == user_id {
                user.failed_login_attempts += 1;
                Ok(())
            } else {
                Err(DomainError::NotFound("Usuario no encontrado".into()))
            }
        }

        async fn reset_failed_login_attempts(&self, user_id: Uuid) -> Result<(), DomainError> {
            let mut user = self.user.lock().unwrap();
            if user.id == user_id {
                user.failed_login_attempts = 0;
                user.lockout_until = None;
                Ok(())
            } else {
                Err(DomainError::NotFound("Usuario no encontrado".into()))
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
                Err(DomainError::NotFound("Usuario no encontrado".into()))
            }
        }

        async fn set_is_active(&self, user_id: Uuid, is_active: bool) -> Result<User, DomainError> {
            let mut user = self.user.lock().unwrap();
            if user.id == user_id {
                user.is_active = is_active;
                user.failed_login_attempts = 0;
                user.lockout_until = None;
                Ok(user.clone())
            } else {
                Err(DomainError::NotFound("Usuario no encontrado".into()))
            }
        }

        async fn update_credentials(&self, user_id: Uuid, email: &str, password_hash: &str, is_temp_password: bool) -> Result<User, DomainError> {
            let mut user = self.user.lock().unwrap();
            if user.id == user_id {
                user.email = email.to_string();
                user.password_hash = password_hash.to_string();
                user.is_temp_password = is_temp_password;
                user.failed_login_attempts = 0;
                user.lockout_until = None;
                user.updated_at = Utc::now();
                Ok(user.clone())
            } else {
                Err(DomainError::NotFound("Usuario no encontrado".into()))
            }
        }
    }

    fn make_password_hash(password: &str) -> String {
        let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .expect("hash valido")
            .to_string()
    }

    fn make_user(email: &str, role: UserRole, is_active: bool) -> User {
        User {
            id: Uuid::new_v4(),
            email: email.to_string(),
            full_name: Some("Usuario".to_string()),
            password_hash: make_password_hash(TEST_PASSWORD),
            role,
            is_active,
            is_temp_password: false,
            failed_login_attempts: 0,
            lockout_until: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    fn build_service(user: User) -> (UserService, Arc<MockUserRepository>) {
        let repo = Arc::new(MockUserRepository::new(user));
        let allowed_domain_repo = Arc::new(MockAllowedDomainRepository);
        (UserService::new(repo.clone(), allowed_domain_repo), repo)
    }

    #[tokio::test]
    async fn test_disable_admin_access_rejects_self_disable() {
        let user = make_user("admin@example.com", UserRole::SuperAdmin, true);
        let (service, repo) = build_service(user);
        let user_id = repo.user.lock().unwrap().id;

        let result = service.disable_admin_access(user_id, user_id).await;

        assert!(matches!(result, Err(DomainError::BadRequest(msg)) if msg.contains("No puedes inhabilitar")));
    }

    #[tokio::test]
    async fn test_reactivate_admin_access_enables_user() {
        let user = make_user("admin@example.com", UserRole::AdminHorarios, false);
        let (service, repo) = build_service(user);
        let actor_user_id = Uuid::new_v4();
        let target_user_id = repo.user.lock().unwrap().id;

        let updated_user = service
            .reactivate_admin_access(actor_user_id, target_user_id)
            .await
            .expect("debe reactivarse");

        assert!(updated_user.is_active);
        let stored_user = repo.user.lock().unwrap().clone();
        assert!(stored_user.is_active);
        assert_eq!(stored_user.failed_login_attempts, 0);
        assert!(stored_user.lockout_until.is_none());
    }

    #[tokio::test]
    async fn test_force_reset_admin_password_replaces_hash_and_marks_temp() {
        let user = make_user("admin@example.com", UserRole::AdminHorarios, true);
        let (service, repo) = build_service(user);
        let actor_user_id = Uuid::new_v4();
        let target_user_id = repo.user.lock().unwrap().id;
        let original_hash = repo.user.lock().unwrap().password_hash.clone();

        let (updated_user, temp_password) = service
            .force_reset_admin_password(actor_user_id, target_user_id)
            .await
            .expect("debe restablecerse la contraseña");

        assert!(updated_user.is_temp_password);
        assert!(!temp_password.is_empty());

        let stored_user = repo.user.lock().unwrap().clone();
        assert!(stored_user.is_temp_password);
        assert_ne!(stored_user.password_hash, original_hash);

        let parsed_hash = PasswordHash::new(&stored_user.password_hash).expect("hash válido");
        assert!(Argon2::default().verify_password(temp_password.as_bytes(), &parsed_hash).is_ok());
        assert!(Argon2::default().verify_password(TEST_PASSWORD.as_bytes(), &parsed_hash).is_err());
    }

    #[tokio::test]
    async fn test_create_admin_normalizes_email_to_lowercase() {
        let user = make_user("existing@example.com", UserRole::SuperAdmin, true);
        let (service, _repo) = build_service(user);

        let (created_user, temp_password) = service
            .create_admin("New.Admin@Example.COM", "Nuevo Admin")
            .await
            .expect("debe crear usuario");

        assert_eq!(created_user.email, "new.admin@example.com");
        assert_eq!(created_user.full_name.as_deref(), Some("Nuevo Admin"));
        assert!(created_user.is_temp_password);
        assert!(!temp_password.is_empty());
    }

    #[tokio::test]
    async fn test_create_admin_blocks_case_insensitive_duplicates() {
        let user = make_user("existing@example.com", UserRole::SuperAdmin, true);
        let (service, _repo) = build_service(user);

        let result = service.create_admin("EXISTING@EXAMPLE.COM", "Duplicado").await;

        assert!(matches!(result, Err(DomainError::Conflict(msg)) if msg.contains("El correo ya está registrado")));
    }
}
