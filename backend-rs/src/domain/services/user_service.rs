use std::sync::Arc;

use argon2::password_hash::rand_core::OsRng;
use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use rand::{distr::Alphanumeric, prelude::{IndexedRandom, SliceRandom}, RngExt};
use regex::Regex;

use crate::domain::{
    errors::DomainError,
    models::user::User,
    ports::{
        allowed_domain_repository::AllowedDomainRepository,
        user_repository::UserRepository,
    },
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

    pub async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError> {
        self.repo.find_by_email(email).await
    }

    pub async fn create_admin(&self, email: &str, full_name: &str) -> Result<(User, String), DomainError> {
        self.ensure_email_format(email)?;
        self.ensure_domain_allowed(email).await?;

        if self.repo.find_by_email(email).await?.is_some() {
            return Err(DomainError::Conflict("El correo ya esta registrado".to_string()));
        }

        let temp_password = self.generate_temp_password(16)?;
        let hash = self.hash_password(&temp_password)?;
        let user = self
            .repo
            .create_admin(email, full_name, &hash, false)
            .await?;

        tracing::info!(
            "SIMULACION EMAIL -> to={} temp_password={} (forzar cambio en primer login)",
            email,
            temp_password
        );

        Ok((user, temp_password))
    }

    fn ensure_email_format(&self, email: &str) -> Result<(), DomainError> {
        let re = Regex::new(r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")
            .map_err(|e| DomainError::Internal(format!("Regex invalida: {e}")))?;
        if !re.is_match(email) {
            return Err(DomainError::BadRequest("Email invalido".to_string()));
        }
        Ok(())
    }

    async fn ensure_domain_allowed(&self, email: &str) -> Result<(), DomainError> {
        let domain = email
            .split('@')
            .nth(1)
            .ok_or_else(|| DomainError::BadRequest("Email invalido".to_string()))?;
        let allowed = self.allowed_domain_repo.find_all().await?;
        if !allowed.iter().any(|d| d.domain == domain) {
            return Err(DomainError::BadRequest(format!(
                "El dominio @{domain} no esta permitido"
            )));
        }
        Ok(())
    }

    fn hash_password(&self, password: &str) -> Result<String, DomainError> {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
            .map_err(|e| DomainError::Internal(format!("No se pudo hashear password: {e}")))
    }

    fn generate_temp_password(&self, length: usize) -> Result<String, DomainError> {
        if length < 4 {
            return Err(DomainError::BadRequest("Longitud de password invalida".to_string()));
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
