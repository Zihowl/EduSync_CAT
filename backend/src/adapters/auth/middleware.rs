use async_graphql::{Context, Error as GqlError};
use axum::http::header::AUTHORIZATION;
use std::sync::Arc;
use uuid::Uuid;

use crate::{
    adapters::auth::jwt::decode_jwt,
    config::AppConfig,
    domain::{
        models::user::User,
        ports::user_repository::UserRepository,
    },
};

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

pub async fn read_active_auth_user_from_headers(
    headers: &axum::http::HeaderMap,
    config: &AppConfig,
    user_repo: Arc<dyn UserRepository>,
) -> Option<AuthUser> {
    let auth_user = read_auth_user_from_headers(headers, config)?;

    match user_repo.find_by_id(auth_user.user_id).await {
        Ok(Some(User { id, email, role, is_active: true, .. })) => Some(AuthUser {
            user_id: id,
            email,
            role: role.as_str().to_string(),
        }),
        Ok(Some(_)) => None,
        Ok(None) | Err(_) => None,
    }
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
