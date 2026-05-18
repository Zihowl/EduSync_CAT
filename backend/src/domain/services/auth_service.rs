use std::sync::{Arc, OnceLock};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, SaltString},
    Argon2, PasswordVerifier,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::domain::{
    errors::DomainError,
    models::user::{User, UserRole},
    ports::{
        allowed_domain_repository::AllowedDomainRepository,
        email_sender::{EmailMessage, EmailSender},
        password_reset_repository::PasswordResetRepository,
        pending_registration_repository::PendingRegistrationRepository,
        teacher_repository::TeacherRepository,
        user_repository::UserRepository,
    },
    validation::{normalize_email, normalize_required_text},
};

#[derive(Clone)]
pub struct AuthService {
    repo: Arc<dyn UserRepository>,
    allowed_domain_repo: Option<Arc<dyn AllowedDomainRepository>>,
    pending_repo: Option<Arc<dyn PendingRegistrationRepository>>,
    teacher_repo: Option<Arc<dyn TeacherRepository>>,
    email_sender: Option<Arc<dyn EmailSender>>,
    password_reset_repo: Option<Arc<dyn PasswordResetRepository>>,
    jwt_secret: String,
    jwt_expires_in_secs: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub role: String,
    pub exp: i64,
    /// Momento de emisión (epoch seconds). Se compara contra
    /// `tokens_invalid_before` del usuario para descartar sesiones previas a
    /// un cambio de credenciales.
    #[serde(default)]
    pub iat: i64,
    /// Alcance acotado del token. `None` = sesión completa. Opcional para
    /// mantener compatibilidad con tokens previos a este campo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

/// Alcance del token de un solo propósito que permite únicamente la mutation
/// `ChangeCredentials`. Vigencia corta para limitar la ventana de uso.
pub const CREDENTIAL_CHANGE_SCOPE: &str = "credential_change";
const CREDENTIAL_CHANGE_TOKEN_SECS: i64 = 600;

#[derive(Clone)]
pub struct LoginResult {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub user: User,
}

fn email_regex() -> &'static Regex {
    static EMAIL_REGEX: OnceLock<Regex> = OnceLock::new();
    EMAIL_REGEX.get_or_init(|| {
        Regex::new(
            r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$",
        )
        .expect("hardcoded email regex must be valid")
    })
}

fn is_valid_email(email: &str) -> bool {
    email_regex().is_match(email)
}

fn generate_verification_code() -> String {
    use rand::RngExt;
    let mut rng = rand::rng();
    let n: u32 = rng.random_range(0..1_000_000);
    format!("{:06}", n)
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
    if password
        .chars()
        .any(|c| "!@#$%^&*()-_=+[]{}<>?".contains(c))
    {
        categories += 1;
    }
    categories >= 3
}

impl AuthService {
    pub fn new(
        repo: Arc<dyn UserRepository>,
        jwt_secret: String,
        jwt_expires_in_secs: i64,
    ) -> Self {
        Self {
            repo,
            allowed_domain_repo: None,
            pending_repo: None,
            teacher_repo: None,
            email_sender: None,
            password_reset_repo: None,
            jwt_secret,
            jwt_expires_in_secs,
        }
    }

    pub fn with_registration_deps(
        mut self,
        allowed_domain_repo: Arc<dyn AllowedDomainRepository>,
        pending_repo: Arc<dyn PendingRegistrationRepository>,
        teacher_repo: Arc<dyn TeacherRepository>,
        email_sender: Arc<dyn EmailSender>,
    ) -> Self {
        self.allowed_domain_repo = Some(allowed_domain_repo);
        self.pending_repo = Some(pending_repo);
        self.teacher_repo = Some(teacher_repo);
        self.email_sender = Some(email_sender);
        self
    }

    pub fn with_password_reset_repo(
        mut self,
        password_reset_repo: Arc<dyn PasswordResetRepository>,
    ) -> Self {
        self.password_reset_repo = Some(password_reset_repo);
        self
    }

    /// Indica si un nombre de usuario está disponible (no registrado).
    pub async fn username_available(&self, username: &str) -> Result<bool, DomainError> {
        let username = crate::domain::validation::normalize_username(username)?;
        Ok(self.repo.find_by_username(&username).await?.is_none())
    }

    /// Perfil de registro para un correo: indica si pertenece a un docente del
    /// catálogo y, de ser así, el nombre institucional sugerido (no editable).
    pub async fn registration_profile(
        &self,
        email: &str,
    ) -> Result<(bool, Option<String>), DomainError> {
        let email = normalize_email(email);
        let Some(teacher_repo) = self.teacher_repo.as_ref() else {
            return Ok((false, None));
        };
        match teacher_repo.find_by_email(&email).await? {
            Some(teacher) => Ok((true, Some(teacher.name))),
            None => Ok((false, None)),
        }
    }

    pub async fn register(
        &self,
        email: &str,
        full_name: &str,
        username: &str,
        password: &str,
        password_confirmation: &str,
    ) -> Result<(uuid::Uuid, chrono::DateTime<Utc>), DomainError> {
        let allowed = self.allowed_domain_repo.as_ref().ok_or_else(|| {
            DomainError::Internal("Registro no disponible: dependencias no configuradas".into())
        })?;
        let pending = self.pending_repo.as_ref().ok_or_else(|| {
            DomainError::Internal("Registro no disponible: dependencias no configuradas".into())
        })?;
        let mailer = self.email_sender.as_ref().ok_or_else(|| {
            DomainError::Internal("Registro no disponible: dependencias no configuradas".into())
        })?;

        let email = normalize_email(email);
        if email.is_empty() || !is_valid_email(&email) {
            return Err(DomainError::BadRequest(
                "Correo electrónico inválido".to_string(),
            ));
        }

        // Nombre de usuario: validar formato y unicidad case-insensitive.
        let username = crate::domain::validation::normalize_username(username)?;
        if self.repo.find_by_username(&username).await?.is_some() {
            return Err(DomainError::Conflict(
                "El nombre de usuario ya está en uso".to_string(),
            ));
        }

        // Nombre completo: si el correo pertenece a un docente del catálogo
        // CAT, el nombre lo define la institución e ignora el valor recibido.
        let resolved_full_name = match self.teacher_repo.as_ref() {
            Some(teacher_repo) => match teacher_repo.find_by_email(&email).await? {
                Some(teacher) => teacher.name,
                None => normalize_required_text("nombre completo", full_name)?,
            },
            None => normalize_required_text("nombre completo", full_name)?,
        };

        if password != password_confirmation {
            return Err(DomainError::BadRequest("Las contraseñas no coinciden".to_string()));
        }
        if password.len() < 8 || !password_meets_complexity(password) {
            return Err(DomainError::BadRequest(
                "La contraseña no cumple los criterios".to_string(),
            ));
        }

        let domain = email
            .split('@')
            .nth(1)
            .ok_or_else(|| DomainError::BadRequest("Correo electrónico inválido".to_string()))?;
        let allowed_list = allowed.find_all().await?;
        if !allowed_list
            .iter()
            .any(|d| d.domain.eq_ignore_ascii_case(domain))
        {
            return Err(DomainError::BadRequest(format!(
                "El dominio @{domain} no está permitido"
            )));
        }

        if self.repo.find_by_email(&email).await?.is_some() {
            return Err(DomainError::Conflict(
                "El correo ya está registrado".to_string(),
            ));
        }

        let mut rng = OsRng;
        let password_hash = Argon2::default()
            .hash_password(password.as_bytes(), &SaltString::generate(&mut rng))
            .map_err(|e| {
                DomainError::Internal(format!("No se pudo generar el hash de la contraseña: {e}"))
            })?
            .to_string();

        let code = generate_verification_code();
        let token = uuid::Uuid::new_v4();
        let expires_at = Utc::now() + Duration::minutes(10);

        pending
            .upsert(
                &email,
                &resolved_full_name,
                &username,
                &password_hash,
                token,
                &code,
                expires_at,
            )
            .await?;

        let message = EmailMessage {
            to_email: email.clone(),
            to_name: None,
            subject: "Código de verificación EduSync".to_string(),
            text_content: format!(
                "Tu código de verificación es: {code}\nExpira en 10 minutos."
            ),
            html_content: Some(format!(
                "<p>Tu código de verificación es: <strong>{code}</strong></p><p>Expira en 10 minutos.</p>"
            )),
        };
        if let Err(err) = mailer.send(message).await {
            tracing::warn!(error = %err, "No se pudo enviar el correo de verificación");
        }

        Ok((token, expires_at))
    }

    pub async fn verify_email(
        &self,
        verification_token: &str,
        code: &str,
    ) -> Result<LoginResult, DomainError> {
        let pending_repo = self.pending_repo.as_ref().ok_or_else(|| {
            DomainError::Internal("Verificación no disponible: dependencias no configuradas".into())
        })?;
        let teacher_repo = self.teacher_repo.as_ref().ok_or_else(|| {
            DomainError::Internal("Verificación no disponible: dependencias no configuradas".into())
        })?;

        let token = uuid::Uuid::parse_str(verification_token.trim())
            .map_err(|_| DomainError::BadRequest("Código incorrecto o expirado".to_string()))?;
        let entry = pending_repo
            .find_by_token(token)
            .await?
            .ok_or_else(|| {
                DomainError::BadRequest("Código incorrecto o expirado".to_string())
            })?;

        if entry.expires_at <= Utc::now() {
            pending_repo.delete(entry.id).await.ok();
            return Err(DomainError::BadRequest(
                "Código incorrecto o expirado".to_string(),
            ));
        }

        if entry.verification_code != code.trim() {
            let attempts = pending_repo.increment_attempts(entry.id).await?;
            if attempts >= 5 {
                pending_repo.delete(entry.id).await.ok();
            }
            return Err(DomainError::BadRequest(
                "Código incorrecto o expirado".to_string(),
            ));
        }

        let role = if teacher_repo.find_by_email(&entry.email).await?.is_some() {
            UserRole::Teacher
        } else {
            UserRole::Student
        };

        let user = self
            .repo
            .create_user_with_role(
                &entry.email,
                &entry.username,
                &entry.full_name,
                &entry.password_hash,
                role.as_str(),
            )
            .await?;
        pending_repo.delete(entry.id).await.ok();

        self.login(user)
    }

    /// Solicita el restablecimiento de contraseña: verifica que el correo
    /// exista (RQNF-APP-13), genera un código de 6 dígitos con expiración de
    /// 10 minutos (RQNF-APP-14) y lo envía por correo.
    pub async fn request_password_reset(
        &self,
        email: &str,
    ) -> Result<(uuid::Uuid, chrono::DateTime<Utc>), DomainError> {
        let reset_repo = self.password_reset_repo.as_ref().ok_or_else(|| {
            DomainError::Internal(
                "Restablecimiento no disponible: dependencias no configuradas".into(),
            )
        })?;
        let mailer = self.email_sender.as_ref().ok_or_else(|| {
            DomainError::Internal(
                "Restablecimiento no disponible: dependencias no configuradas".into(),
            )
        })?;

        let email = normalize_email(email);
        if email.is_empty() || !is_valid_email(&email) {
            return Err(DomainError::BadRequest(
                "Correo electrónico inválido".to_string(),
            ));
        }

        // RQNF-APP-13: el correo debe existir en la base de datos.
        if self.repo.find_by_email(&email).await?.is_none() {
            return Err(DomainError::NotFound(
                "No existe una cuenta registrada con ese correo".to_string(),
            ));
        }

        let code = generate_verification_code();
        let token = uuid::Uuid::new_v4();
        let expires_at = Utc::now() + Duration::minutes(10);

        reset_repo.upsert(&email, token, &code, expires_at).await?;

        let message = EmailMessage {
            to_email: email.clone(),
            to_name: None,
            subject: "Restablecimiento de contraseña EduSync".to_string(),
            text_content: format!(
                "Tu código para restablecer la contraseña es: {code}\nExpira en 10 minutos."
            ),
            html_content: Some(format!(
                "<p>Tu código para restablecer la contraseña es: <strong>{code}</strong></p><p>Expira en 10 minutos.</p>"
            )),
        };
        if let Err(err) = mailer.send(message).await {
            tracing::warn!(error = %err, "No se pudo enviar el correo de restablecimiento");
        }

        Ok((token, expires_at))
    }

    /// Valida el código de 6 dígitos del restablecimiento (RQNF-APP-15) y, si
    /// es correcto, marca la solicitud como verificada.
    pub async fn verify_password_reset_code(
        &self,
        verification_token: &str,
        code: &str,
    ) -> Result<(), DomainError> {
        let reset_repo = self.password_reset_repo.as_ref().ok_or_else(|| {
            DomainError::Internal(
                "Restablecimiento no disponible: dependencias no configuradas".into(),
            )
        })?;

        let token = uuid::Uuid::parse_str(verification_token.trim())
            .map_err(|_| DomainError::BadRequest("Código incorrecto o expirado".to_string()))?;
        let entry = reset_repo
            .find_by_token(token)
            .await?
            .ok_or_else(|| DomainError::BadRequest("Código incorrecto o expirado".to_string()))?;

        if entry.expires_at <= Utc::now() {
            reset_repo.delete(entry.id).await.ok();
            return Err(DomainError::BadRequest(
                "Código incorrecto o expirado".to_string(),
            ));
        }

        if entry.verification_code != code.trim() {
            let attempts = reset_repo.increment_attempts(entry.id).await?;
            if attempts >= 5 {
                reset_repo.delete(entry.id).await.ok();
            }
            return Err(DomainError::BadRequest(
                "Código incorrecto o expirado".to_string(),
            ));
        }

        reset_repo.mark_code_verified(entry.id).await?;
        Ok(())
    }

    /// Completa el restablecimiento: exige que el código haya sido verificado,
    /// valida la nueva contraseña (RQNF-APP-16/17/18) y la persiste.
    pub async fn complete_password_reset(
        &self,
        verification_token: &str,
        new_password: &str,
        new_password_confirmation: &str,
    ) -> Result<(), DomainError> {
        let reset_repo = self.password_reset_repo.as_ref().ok_or_else(|| {
            DomainError::Internal(
                "Restablecimiento no disponible: dependencias no configuradas".into(),
            )
        })?;

        let token = uuid::Uuid::parse_str(verification_token.trim())
            .map_err(|_| DomainError::BadRequest("Código incorrecto o expirado".to_string()))?;
        let entry = reset_repo
            .find_by_token(token)
            .await?
            .ok_or_else(|| DomainError::BadRequest("Código incorrecto o expirado".to_string()))?;

        if entry.expires_at <= Utc::now() {
            reset_repo.delete(entry.id).await.ok();
            return Err(DomainError::BadRequest(
                "Código incorrecto o expirado".to_string(),
            ));
        }

        if !entry.code_verified {
            return Err(DomainError::BadRequest(
                "Debes verificar el código antes de cambiar la contraseña".to_string(),
            ));
        }

        // RQNF-APP-17: la contraseña y su confirmación deben coincidir.
        if new_password != new_password_confirmation {
            return Err(DomainError::BadRequest(
                "Las contraseñas no coinciden".to_string(),
            ));
        }

        // RQNF-APP-16: longitud mínima de 8 y al menos 3 de 4 categorías.
        if new_password.len() < 8 || !password_meets_complexity(new_password) {
            return Err(DomainError::BadRequest(
                "La contraseña no cumple los criterios".to_string(),
            ));
        }

        let user = self
            .repo
            .find_by_email(&entry.email)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound("No existe una cuenta registrada con ese correo".to_string())
            })?;

        // RQNF-APP-18: la nueva contraseña no puede coincidir con la anterior.
        if let Ok(parsed) = PasswordHash::new(&user.password_hash) {
            if Argon2::default()
                .verify_password(new_password.as_bytes(), &parsed)
                .is_ok()
            {
                return Err(DomainError::BadRequest(
                    "La nueva contraseña no puede ser igual a la anterior".to_string(),
                ));
            }
        }

        let mut rng = OsRng;
        let new_password_hash = Argon2::default()
            .hash_password(new_password.as_bytes(), &SaltString::generate(&mut rng))
            .map_err(|e| {
                DomainError::Internal(format!("No se pudo generar el hash de la contraseña: {e}"))
            })?
            .to_string();

        self.repo
            .update_credentials(user.id, &user.email, &new_password_hash, false)
            .await?;
        reset_repo.delete(entry.id).await.ok();

        Ok(())
    }

    pub async fn validate_user(&self, email: &str, password: &str) -> Result<User, DomainError> {
        let normalized_email = normalize_email(email);
        if normalized_email.is_empty() {
            return Err(DomainError::BadRequest("Email es requerido".to_string()));
        }

        if !is_valid_email(&normalized_email) {
            return Err(DomainError::BadRequest(
                "Correo electrónico inválido".to_string(),
            ));
        }

        if password.trim().is_empty() {
            return Err(DomainError::BadRequest(
                "Contraseña es requerida".to_string(),
            ));
        }

        let user = self
            .repo
            .find_by_email(&normalized_email)
            .await?
            .ok_or_else(|| DomainError::Unauthorized("Credenciales inválidas".to_string()))?;

        if !user.is_active {
            return Err(DomainError::Unauthorized("Cuenta inactiva".to_string()));
        }

        if let Some(lockout_until) = user.lockout_until {
            if lockout_until > Utc::now() {
                let remaining = lockout_until
                    .signed_duration_since(Utc::now())
                    .num_seconds()
                    .max(0);
                return Err(DomainError::Unauthorized(format!(
                    "Cuenta bloqueada temporalmente. Intenta de nuevo en {} segundos",
                    remaining
                )));
            }
        }

        self.verify_user_password(&user, password, true).await?;
        Ok(user)
    }

    async fn verify_user_password(
        &self,
        user: &User,
        password: &str,
        allow_temp_password: bool,
    ) -> Result<(), DomainError> {
        if let Some(lockout_until) = user.lockout_until {
            if lockout_until > Utc::now() {
                let remaining = lockout_until
                    .signed_duration_since(Utc::now())
                    .num_seconds()
                    .max(0);
                return Err(DomainError::Unauthorized(format!(
                    "Cuenta bloqueada temporalmente. Intenta de nuevo en {} segundos",
                    remaining
                )));
            }
        }

        let parsed = PasswordHash::new(&user.password_hash)
            .map_err(|_| DomainError::Unauthorized("Credenciales inválidas".to_string()))?;

        if Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_err()
        {
            self.repo.increment_failed_login_attempts(user.id).await?;

            let updated_user = self.repo.find_by_id(user.id).await?.ok_or_else(|| {
                DomainError::Internal("Usuario no encontrado tras intento fallido".to_string())
            })?;

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

            return Err(DomainError::Unauthorized(
                "Credenciales inválidas".to_string(),
            ));
        }

        self.repo.reset_failed_login_attempts(user.id).await?;
        self.repo.set_lockout_until(user.id, None).await?;

        if !allow_temp_password && user.is_temp_password {
            return Err(DomainError::Unauthorized(
                "Contraseña temporal. Cambia tu contraseña antes de continuar".to_string(),
            ));
        }

        Ok(())
    }

    /// Firma un JWT para el usuario con el alcance y vigencia indicados.
    fn sign_token(
        &self,
        user: User,
        scope: Option<String>,
        expires_in: i64,
    ) -> Result<LoginResult, DomainError> {
        let now = Utc::now();
        let exp = (now + Duration::seconds(expires_in)).timestamp();
        let claims = Claims {
            sub: user.id.to_string(),
            email: user.email.clone(),
            role: user.role.as_str().to_string(),
            exp,
            iat: now.timestamp(),
            scope,
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
            expires_in,
            user,
        })
    }

    pub fn login(&self, user: User) -> Result<LoginResult, DomainError> {
        self.sign_token(user, None, self.jwt_expires_in_secs)
    }

    /// Emite un token de un solo propósito (alcance `credential_change`) para
    /// que un usuario con contraseña temporal pueda invocar `ChangeCredentials`
    /// sin reingresar sus credenciales. Vigencia corta (10 min).
    pub fn issue_credential_change_token(
        &self,
        user: &User,
    ) -> Result<LoginResult, DomainError> {
        self.sign_token(
            user.clone(),
            Some(CREDENTIAL_CHANGE_SCOPE.to_string()),
            CREDENTIAL_CHANGE_TOKEN_SECS,
        )
    }

    /// Re-emite el JWT de un usuario ya autenticado tomando su rol actual de
    /// la base de datos. Permite que la app refleje cambios de rol sin
    /// requerir un nuevo inicio de sesión.
    pub async fn refresh_session(
        &self,
        user_id: uuid::Uuid,
    ) -> Result<LoginResult, DomainError> {
        let user = self
            .repo
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::Unauthorized("Sesión inválida".to_string()))?;
        if !user.is_active {
            return Err(DomainError::Unauthorized("Cuenta inactiva".to_string()));
        }
        self.login(user)
    }

    /// Cambia el correo y/o la contraseña del usuario identificado por su id
    /// (tomado del JWT). La autenticación ya ocurrió al iniciar sesión, por lo
    /// que aquí no se reingresa la contraseña actual.
    pub async fn change_credentials(
        &self,
        user_id: uuid::Uuid,
        new_email: &str,
        new_password: &str,
    ) -> Result<User, DomainError> {
        let new_email = normalize_email(new_email);
        let new_password = new_password.trim();

        if new_email.is_empty() || new_password.is_empty() {
            return Err(DomainError::BadRequest(
                "Correo y nueva contraseña son requeridos".to_string(),
            ));
        }

        let user = self
            .repo
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| DomainError::Unauthorized("Sesión inválida".to_string()))?;

        if !user.is_active {
            return Err(DomainError::Unauthorized("Cuenta inactiva".to_string()));
        }

        let current_email = normalize_email(&user.email);

        if !is_valid_email(&new_email) {
            return Err(DomainError::BadRequest("Nuevo correo inválido".to_string()));
        }

        if new_email.ends_with("@setup.local") {
            return Err(DomainError::BadRequest(
                "El dominio @setup.local no está permitido".to_string(),
            ));
        }

        if new_email != current_email && user.role != UserRole::SuperAdmin {
            return Err(DomainError::Unauthorized(
                "Solo el Súper Administrador puede cambiar el correo electrónico".to_string(),
            ));
        }

        if new_email != current_email {
            if self.repo.find_by_email(&new_email).await?.is_some() {
                return Err(DomainError::Conflict(
                    "El correo ya está registrado".to_string(),
                ));
            }
        }

        if new_password.len() < 8 {
            return Err(DomainError::BadRequest(
                "La contraseña debe tener al menos 8 caracteres".to_string(),
            ));
        }

        if !password_meets_complexity(new_password) {
            return Err(DomainError::BadRequest("La contraseña debe incluir al menos 3 de 4 categorías: mayúsculas, minúsculas, números y símbolos".to_string()));
        }

        if self
            .verify_user_password(&user, new_password, true)
            .await
            .is_ok()
        {
            return Err(DomainError::BadRequest(
                "La nueva contraseña no puede ser igual a la actual".to_string(),
            ));
        }

        let mut rng = OsRng;
        let new_password_hash = Argon2::default()
            .hash_password(new_password.as_bytes(), &SaltString::generate(&mut rng))
            .map_err(|e| {
                DomainError::Internal(format!("No se pudo generar el hash de la contraseña: {e}"))
            })?
            .to_string();

        let updated_user = self
            .repo
            .update_credentials(user.id, &new_email, &new_password_hash, false)
            .await?;

        Ok(updated_user)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::auth::jwt::decode_jwt;
    use crate::adapters::auth::middleware::read_auth_user_from_headers;
    use crate::config::AppConfig;
    use crate::domain::errors::DomainError;

    const TEST_PASSWORD: &str = "CorrectHorseBatteryStaple1!";
    use crate::domain::models::user::{User, UserRole};
    use crate::domain::ports::user_repository::UserRepository;
    use argon2::{
        password_hash::{PasswordHasher, SaltString},
        Argon2,
    };
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

        async fn find_by_username(&self, username: &str) -> Result<Option<User>, DomainError> {
            let user = self.user.lock().unwrap().clone();
            if user.username.eq_ignore_ascii_case(username) {
                Ok(Some(user))
            } else {
                Ok(None)
            }
        }

        async fn create_admin(
            &self,
            _email: &str,
            _username: &str,
            _full_name: &str,
            _password_hash: &str,
            _is_super_admin: bool,
        ) -> Result<User, DomainError> {
            Err(DomainError::Internal("create_admin not implemented".into()))
        }

        async fn create_user_with_role(
            &self,
            _email: &str,
            _username: &str,
            _full_name: &str,
            _password_hash: &str,
            _role: &str,
        ) -> Result<User, DomainError> {
            Err(DomainError::Internal(
                "create_user_with_role not implemented".into(),
            ))
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

        async fn update_credentials(
            &self,
            user_id: Uuid,
            email: &str,
            password_hash: &str,
            is_temp_password: bool,
        ) -> Result<User, DomainError> {
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

    async fn setup_auth_service() -> (AuthService, std::sync::Arc<MockUserRepository>) {
        let password = TEST_PASSWORD;
        let salt = SaltString::from_b64("1234567890123456").unwrap();
        let hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .unwrap()
            .to_string();

        let user = User {
            id: Uuid::new_v4(),
            email: "admin@example.com".to_string(),
            username: "admin".to_string(),
            full_name: "Admin".to_string(),
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
            let res = auth_service
                .validate_user("admin@example.com", "wrong password")
                .await;
            assert!(matches!(res, Err(DomainError::Unauthorized(_))));
        }

        let user_after_two = repo
            .find_by_email("admin@example.com")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(user_after_two.failed_login_attempts, 2);
        assert!(user_after_two.lockout_until.is_none());

        // Third invalid attempt triggers 15s lockout.
        let res3 = auth_service
            .validate_user("admin@example.com", "wrong password")
            .await;
        assert!(
            matches!(res3, Err(DomainError::Unauthorized(msg)) if msg.contains("Cuenta bloqueada temporalmente"))
        );

        let user_after_three = repo
            .find_by_email("admin@example.com")
            .await
            .unwrap()
            .unwrap();
        assert!(user_after_three.failed_login_attempts >= 3);
        assert!(user_after_three.lockout_until.is_some());

        // If lockout is in effect, login with correct password is blocked.
        let res_locked = auth_service
            .validate_user("admin@example.com", TEST_PASSWORD)
            .await;
        assert!(
            matches!(res_locked, Err(DomainError::Unauthorized(msg)) if msg.contains("Cuenta bloqueada temporalmente"))
        );

        // Force unlock and test successful login resets counters.
        repo.set_lockout_until(user_after_three.id, Some(Utc::now() - Duration::seconds(1)))
            .await
            .unwrap();
        let success = auth_service
            .validate_user("admin@example.com", TEST_PASSWORD)
            .await;
        assert!(success.is_ok());

        let user_after_success = repo
            .find_by_email("admin@example.com")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(user_after_success.failed_login_attempts, 0);
        assert!(user_after_success.lockout_until.is_none());
    }

    #[tokio::test]
    async fn test_temp_password_login_is_allowed_before_change_credentials() {
        let (auth_service, repo) = setup_auth_service().await;

        // Mark this user as having temporary password in repo state.
        {
            let mut user = repo.user.lock().unwrap();
            user.is_temp_password = true;
        }

        let result = auth_service
            .validate_user("admin@example.com", TEST_PASSWORD)
            .await;

        assert!(result.is_ok());

        let login_result = auth_service.login(result.unwrap()).unwrap();
        assert!(!login_result.access_token.is_empty());
        assert!(login_result.user.is_temp_password);
    }

    #[tokio::test]
    async fn test_validate_user_accepts_uppercase_email_input() {
        let (auth_service, _repo) = setup_auth_service().await;

        let result = auth_service
            .validate_user("ADMIN@EXAMPLE.COM", TEST_PASSWORD)
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap().email, "admin@example.com");
    }

    #[tokio::test]
    async fn test_validate_user_rejects_invalid_email_format() {
        let (auth_service, repo) = setup_auth_service().await;

        let result = auth_service
            .validate_user("admin@example", TEST_PASSWORD)
            .await;

        assert!(
            matches!(result, Err(DomainError::BadRequest(msg)) if msg.contains("Correo electrónico inválido"))
        );

        let user = repo
            .find_by_email("admin@example.com")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(user.failed_login_attempts, 0);
        assert!(user.lockout_until.is_none());
    }

    #[tokio::test]
    async fn test_change_credentials_transitions_from_temp_password() {
        let (auth_service, repo) = setup_auth_service().await;

        let user_id = {
            let mut user = repo.user.lock().unwrap();
            user.is_temp_password = true;
            user.id
        };

        let result = auth_service
            .change_credentials(user_id, "admin2@example.com", "NewStrongPass1!")
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

    #[tokio::test]
    async fn test_change_credentials_normalizes_new_email_to_lowercase() {
        let (auth_service, repo) = setup_auth_service().await;

        let user_id = {
            let mut user = repo.user.lock().unwrap();
            user.role = UserRole::SuperAdmin;
            user.id
        };

        let result = auth_service
            .change_credentials(user_id, "New-Admin@Example.COM", "NewStrongPass1!")
            .await;

        assert!(result.is_ok());
        let updated_user = result.unwrap();
        assert_eq!(updated_user.email, "new-admin@example.com");

        let stored_user = repo
            .find_by_email("new-admin@example.com")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(stored_user.email, "new-admin@example.com");
    }

    #[tokio::test]
    async fn test_change_credentials_rejects_same_password() {
        let (auth_service, repo) = setup_auth_service().await;

        let user_id = repo
            .find_by_email("admin@example.com")
            .await
            .unwrap()
            .unwrap()
            .id;

        let result = auth_service
            .change_credentials(user_id, "admin@example.com", TEST_PASSWORD)
            .await;

        assert!(
            matches!(result, Err(DomainError::BadRequest(msg)) if msg.contains("La nueva contraseña no puede ser igual a la actual"))
        );
    }

    #[tokio::test]
    async fn test_change_credentials_rejects_email_change_for_non_superadmin() {
        let (auth_service, repo) = setup_auth_service().await;

        let user_id = {
            let mut user = repo.user.lock().unwrap();
            user.role = UserRole::AdminHorarios;
            user.id
        };

        let result = auth_service
            .change_credentials(user_id, "new-admin@example.com", "NewStrongPass1!")
            .await;

        assert!(
            matches!(result, Err(DomainError::Unauthorized(msg)) if msg.contains("Solo el Súper Administrador puede cambiar el correo electrónico"))
        );
    }

    #[tokio::test]
    async fn test_change_credentials_with_specific_temp_user_fails_email_change() {
        let (auth_service, repo) = setup_auth_service().await;

        let user_id = {
            let mut user = repo.user.lock().unwrap();
            user.role = UserRole::AdminHorarios;
            user.email = "test@test.com".to_string();
            let salt = SaltString::from_b64("1234567890123456").unwrap();
            let hash = Argon2::default()
                .hash_password("4wemEhG1n7MB8lm?".as_bytes(), &salt)
                .unwrap()
                .to_string();
            user.password_hash = hash;
            user.id
        };

        let result = auth_service
            .change_credentials(user_id, "target@test.com", "NewStrongPass1!")
            .await;

        assert!(
            matches!(result, Err(DomainError::Unauthorized(msg)) if msg.contains("Solo el Súper Administrador puede cambiar el correo electrónico"))
        );
    }

    #[tokio::test]
    async fn test_login_token_contains_role_and_valid_signature() {
        let (auth_service, repo) = setup_auth_service().await;
        let user = repo
            .find_by_email("admin@example.com")
            .await
            .unwrap()
            .unwrap();

        let login_result = auth_service.login(user.clone()).unwrap();
        let claims =
            decode_jwt(&login_result.access_token, "secret").expect("JWT debe ser decodificable");

        assert_eq!(claims.email, "admin@example.com");
        assert_eq!(claims.role, "SUPER_ADMIN");
        assert!(claims.exp > Utc::now().timestamp());
    }

    #[tokio::test]
    async fn test_read_auth_user_from_headers_extracts_claims() {
        let claims = crate::adapters::auth::jwt::JwtClaims {
            sub: Uuid::new_v4().to_string(),
            email: "admin@example.com".to_string(),
            role: "SUPER_ADMIN".to_string(),
            exp: (Utc::now() + Duration::seconds(3600)).timestamp(),
            iat: Utc::now().timestamp(),
            scope: None,
        };
        let token =
            crate::adapters::auth::jwt::encode_jwt(&claims, "secret").expect("JWT debe generarse");

        let mut headers = axum::http::HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            format!("Bearer {}", token).parse().unwrap(),
        );

        let config = AppConfig {
            app_host: "0.0.0.0".to_string(),
            app_port: 3000,
            database_url: "postgres://postgres:postgres@localhost:5432/edusync_db".to_string(),
            jwt_secret: "secret".to_string(),
            jwt_expires_in_secs: 3600,
            cors_origin: "http://localhost:8100".to_string(),
            brevo_api_key: String::new(),
            brevo_sender_email: String::new(),
            brevo_sender_name: std::env::var("BREVO_SENDER_NAME").unwrap_or_default(),
            genesis_super_admin_email: "superadmin@edusync.edu.mx".to_string(),
            genesis_super_admin_password: "ChangeMe123!".to_string(),
            genesis_super_admin_name: "Súper Administrador".to_string(),
        };

        let auth_user =
            read_auth_user_from_headers(&headers, &config).expect("Debe extraerse sesión");
        assert_eq!(auth_user.email, "admin@example.com");
        assert_eq!(auth_user.role, "SUPER_ADMIN");
    }
}
