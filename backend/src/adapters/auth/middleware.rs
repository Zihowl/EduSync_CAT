use async_graphql::{Context, Error as GqlError};
use axum::http::header::AUTHORIZATION;
use uuid::Uuid;

use crate::{adapters::auth::jwt::decode_jwt, config::AppConfig};

#[derive(Clone, Debug)]
pub struct AuthUser {
    pub user_id: Uuid,
    #[allow(dead_code)]
    pub email: String,
    pub role: String,
}

impl AuthUser {
    pub fn is_admin_horarios(&self) -> bool {
        self.role == "ADMIN_HORARIOS" || self.role == "SUPER_ADMIN"
    }

    pub fn is_super_admin(&self) -> bool {
        self.role == "SUPER_ADMIN"
    }
}

pub fn read_auth_user_from_headers(headers: &axum::http::HeaderMap, config: &AppConfig) -> Option<AuthUser> {
    let header = headers.get(AUTHORIZATION)?.to_str().ok()?;
    let token = header.strip_prefix("Bearer ")?;
    let claims = decode_jwt(token, &config.jwt_secret).ok()?;
    let user_id = Uuid::parse_str(&claims.sub).ok()?;

    Some(AuthUser {
        user_id,
        email: claims.email,
        role: claims.role,
    })
}

pub fn require_admin(ctx: &Context<'_>) -> Result<AuthUser, GqlError> {
    let user = ctx
        .data_opt::<AuthUser>()
        .cloned()
        .ok_or_else(|| GqlError::new("Unauthorized"))?;
    if !user.is_admin_horarios() {
        return Err(GqlError::new("Forbidden"));
    }
    Ok(user)
}

pub fn require_super_admin(ctx: &Context<'_>) -> Result<AuthUser, GqlError> {
    let user = ctx
        .data_opt::<AuthUser>()
        .cloned()
        .ok_or_else(|| GqlError::new("Unauthorized"))?;
    if !user.is_super_admin() {
        return Err(GqlError::new("Forbidden"));
    }
    Ok(user)
}
