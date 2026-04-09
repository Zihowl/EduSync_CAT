use std::sync::Arc;

use async_graphql::{Context, ID, Object};
use serde_json::json;
use uuid::Uuid;

use crate::{
    adapters::{
        auth::middleware::require_super_admin,
        graphql::{
            audit::record_admin_audit,
            inputs::user_input::CreateAdminInput,
            realtime::{publish_realtime_event, RealtimeScope},
            schema::to_gql_error,
            types::user_type::UserType,
        },
    },
    domain::services::user_service::UserService,
};

#[derive(Default)]
pub struct UserMutation;

#[Object]
impl UserMutation {
    #[graphql(name = "CreateAdmin")]
    async fn create_admin(&self, ctx: &Context<'_>, input: CreateAdminInput) -> async_graphql::Result<UserType> {
        let auth_user = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<UserService>>()?;
        let result: async_graphql::Result<UserType> = svc
            .create_admin(&input.email, &input.full_name)
            .await
            .map_err(to_gql_error)
            .map(|(user, _temp_password)| UserType::from(user));

        if result.is_ok() {
            if let Ok(user) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "create_admin",
                    "user",
                    Some(user.id.to_string()),
                    json!({
                        "email": user.email,
                        "full_name": input.full_name,
                        "role": "ADMIN_HORARIOS",
                        "is_temp_password": true
                    }),
                ).await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::Users]);
        }

        result
    }

    #[graphql(name = "DisableAdminAccess")]
    async fn disable_admin_access(&self, ctx: &Context<'_>, user_id: ID) -> async_graphql::Result<UserType> {
        let auth_user = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<UserService>>()?;
        let target_user_id = Uuid::parse_str(user_id.as_str())
            .map_err(|_| async_graphql::Error::new("Identificador de usuario invalido"))?;

        let result: async_graphql::Result<UserType> = svc
            .disable_admin_access(auth_user.user_id, target_user_id)
            .await
            .map_err(to_gql_error)
            .map(UserType::from);

        if result.is_ok() {
            if let Ok(user) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "disable_admin_access",
                    "user",
                    Some(user.id.to_string()),
                    json!({
                        "email": user.email,
                        "is_active": false
                    }),
                ).await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::Users]);
        }

        result
    }

    #[graphql(name = "ReactivateAdminAccess")]
    async fn reactivate_admin_access(&self, ctx: &Context<'_>, user_id: ID) -> async_graphql::Result<UserType> {
        let auth_user = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<UserService>>()?;
        let target_user_id = Uuid::parse_str(user_id.as_str())
            .map_err(|_| async_graphql::Error::new("Identificador de usuario invalido"))?;

        let result: async_graphql::Result<UserType> = svc
            .reactivate_admin_access(auth_user.user_id, target_user_id)
            .await
            .map_err(to_gql_error)
            .map(UserType::from);

        if result.is_ok() {
            if let Ok(user) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "reactivate_admin_access",
                    "user",
                    Some(user.id.to_string()),
                    json!({
                        "email": user.email,
                        "is_active": true
                    }),
                ).await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::Users]);
        }

        result
    }

    #[graphql(name = "ForceResetAdminPassword")]
    async fn force_reset_admin_password(&self, ctx: &Context<'_>, user_id: ID) -> async_graphql::Result<UserType> {
        let auth_user = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<UserService>>()?;
        let target_user_id = Uuid::parse_str(user_id.as_str())
            .map_err(|_| async_graphql::Error::new("Identificador de usuario invalido"))?;

        let result: async_graphql::Result<UserType> = svc
            .force_reset_admin_password(auth_user.user_id, target_user_id)
            .await
            .map_err(to_gql_error)
            .map(|(user, _temp_password)| UserType::from(user));

        if result.is_ok() {
            if let Ok(user) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "force_reset_admin_password",
                    "user",
                    Some(user.id.to_string()),
                    json!({
                        "email": user.email,
                        "is_temp_password": true,
                        "reset_requested": true
                    }),
                ).await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::Users]);
        }

        result
    }
}
