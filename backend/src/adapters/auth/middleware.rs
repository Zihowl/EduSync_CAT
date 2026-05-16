use async_graphql::{Context, Error as GqlError};
use axum::http::header::AUTHORIZATION;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    adapters::auth::jwt::decode_jwt,
    config::AppConfig,
    domain::{models::user::User, ports::user_repository::UserRepository},
};

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub user_id: Uuid,
    #[allow(dead_code)]
    pub email: String,
    pub role: String,
    /// Alcance acotado del token. `None` = sesión completa.
    pub scope: Option<String>,
    /// Momento de emisión del token (epoch seconds).
    pub issued_at: i64,
}

/// Alcance del token de un solo propósito para cambiar credenciales.
const CREDENTIAL_CHANGE_SCOPE: &str = "credential_change";

impl AuthUser {
    pub fn is_admin_horarios(&self) -> bool {
        self.role == "ADMIN_HORARIOS" || self.role == "SUPER_ADMIN"
    }

    pub fn is_super_admin(&self) -> bool {
        self.role == "SUPER_ADMIN"
    }

    /// `true` si el token solo autoriza la mutation `ChangeCredentials`.
    pub fn is_credential_change_only(&self) -> bool {
        self.scope.as_deref() == Some(CREDENTIAL_CHANGE_SCOPE)
    }
}

pub fn read_auth_user_from_headers(
    headers: &axum::http::HeaderMap,
    config: &AppConfig,
) -> Option<AuthUser> {
    let header = headers.get(AUTHORIZATION)?.to_str().ok()?;
    let token = header.strip_prefix("Bearer ")?;
    let claims = decode_jwt(token, &config.jwt_secret).ok()?;
    let user_id = Uuid::parse_str(&claims.sub).ok()?;

    Some(AuthUser {
        user_id,
        email: claims.email,
        role: claims.role,
        scope: claims.scope,
        issued_at: claims.iat,
    })
}

pub async fn read_active_auth_user_from_headers(
    headers: &axum::http::HeaderMap,
    config: &AppConfig,
    user_repo: Arc<dyn UserRepository>,
) -> Option<AuthUser> {
    let auth_user = read_auth_user_from_headers(headers, config)?;

    // Rechaza tokens emitidos antes de un cambio de credenciales: al cambiarlas
    // se fija `tokens_invalid_before`, invalidando toda sesión previa.
    match user_repo.tokens_invalid_before(auth_user.user_id).await {
        Ok(Some(invalid_before)) if auth_user.issued_at < invalid_before.timestamp() => {
            return None;
        }
        Err(_) => return None,
        _ => {}
    }

    match user_repo.find_by_id(auth_user.user_id).await {
        Ok(Some(User {
            id,
            email,
            role,
            is_active: true,
            ..
        })) => Some(AuthUser {
            user_id: id,
            email,
            role: role.as_str().to_string(),
            scope: auth_user.scope,
            issued_at: auth_user.issued_at,
        }),
        Ok(Some(_)) => None,
        Ok(None) | Err(_) => None,
    }
}

pub fn require_admin(ctx: &Context<'_>) -> Result<AuthUser, GqlError> {
    let user = ctx
        .data_opt::<AuthUser>()
        .cloned()
        .ok_or_else(|| GqlError::new("No autorizado"))?;
    if user.is_credential_change_only() || !user.is_admin_horarios() {
        return Err(GqlError::new("Acceso denegado"));
    }
    Ok(user)
}

pub fn require_auth(ctx: &Context<'_>) -> Result<AuthUser, GqlError> {
    let user = ctx
        .data_opt::<AuthUser>()
        .cloned()
        .ok_or_else(|| GqlError::new("No autorizado"))?;
    if user.is_credential_change_only() {
        return Err(GqlError::new("Acceso denegado"));
    }
    Ok(user)
}

pub fn require_super_admin(ctx: &Context<'_>) -> Result<AuthUser, GqlError> {
    let user = ctx
        .data_opt::<AuthUser>()
        .cloned()
        .ok_or_else(|| GqlError::new("No autorizado"))?;
    if user.is_credential_change_only() || !user.is_super_admin() {
        return Err(GqlError::new("Acceso denegado"));
    }
    Ok(user)
}
