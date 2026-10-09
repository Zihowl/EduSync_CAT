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

use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub struct CachedAuthValidation {
    pub auth_user: AuthUser,
    pub expires_at: Instant,
}

/// Caché en memoria de corta duración (TTL) para evitar saturar PostgreSQL
/// con verificaciones de sesión repetitivas en cada petición HTTP.
#[derive(Default)]
pub struct AuthUserCache {
    entries: RwLock<HashMap<Uuid, CachedAuthValidation>>,
}

impl AuthUserCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn get(&self, user_id: &Uuid, token_issued_at: i64) -> Option<AuthUser> {
        let read = self.entries.read().await;
        if let Some(cached) = read.get(user_id) {
            if Instant::now() < cached.expires_at && cached.auth_user.issued_at >= token_issued_at {
                return Some(cached.auth_user.clone());
            }
        }
        None
    }

    pub async fn insert(&self, user_id: Uuid, auth_user: AuthUser, ttl: Duration) {
        let mut write = self.entries.write().await;
        if write.len() > 10_000 {
            let now = Instant::now();
            write.retain(|_, v| v.expires_at > now);
        }
        write.insert(
            user_id,
            CachedAuthValidation {
                auth_user,
                expires_at: Instant::now() + ttl,
            },
        );
    }

    pub async fn invalidate(&self, user_id: &Uuid) {
        let mut write = self.entries.write().await;
        write.remove(user_id);
    }
}

pub async fn read_active_auth_user_from_headers(
    headers: &axum::http::HeaderMap,
    config: &AppConfig,
    user_repo: Arc<dyn UserRepository>,
    auth_cache: Option<&Arc<AuthUserCache>>,
) -> Option<AuthUser> {
    let auth_user = read_auth_user_from_headers(headers, config)?;

    // 1. Fast-Path: Retorna de inmediato si la sesión ya fue validada recientemente
    if let Some(cache) = auth_cache {
        if let Some(cached_user) = cache.get(&auth_user.user_id, auth_user.issued_at).await {
            return Some(cached_user);
        }
    }

    // 2. Slow-Path: Única consulta a Postgres que trae datos, rol, estado activo y revocaciones
    match user_repo.find_by_id(auth_user.user_id).await {
        Ok(Some(User {
            id,
            email,
            role,
            is_active: true,
            tokens_invalid_before,
            ..
        })) => {
            // Rechaza tokens emitidos antes de un cambio de credenciales
            if let Some(invalid_before) = tokens_invalid_before {
                if auth_user.issued_at < invalid_before.timestamp() {
                    return None;
                }
            }

            let validated = AuthUser {
                user_id: id,
                email,
                role: role.as_str().to_string(),
                scope: auth_user.scope,
                issued_at: auth_user.issued_at,
            };

            // Guarda en caché por 30 segundos
            if let Some(cache) = auth_cache {
                cache.insert(id, validated.clone(), Duration::from_secs(30)).await;
            }

            Some(validated)
        }
        _ => None,
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
