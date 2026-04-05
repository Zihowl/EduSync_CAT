use std::sync::Arc;

use async_graphql::{Context, ID, Object};
use uuid::Uuid;

use crate::{
    adapters::{
        auth::middleware::require_super_admin,
        graphql::{
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
        let _ = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<UserService>>()?;
        let result = svc
            .create_admin(&input.email, &input.full_name)
            .await
            .map_err(to_gql_error)
            .map(|(user, _temp_password)| user.into());

        if result.is_ok() {
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

        let result = svc
            .disable_admin_access(auth_user.user_id, target_user_id)
            .await
            .map_err(to_gql_error)
            .map(Into::into);

        if result.is_ok() {
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

        let result = svc
            .reactivate_admin_access(auth_user.user_id, target_user_id)
            .await
            .map_err(to_gql_error)
            .map(Into::into);

        if result.is_ok() {
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

        let result = svc
            .force_reset_admin_password(auth_user.user_id, target_user_id)
            .await
            .map_err(to_gql_error)
            .map(|(user, _temp_password)| user.into());

        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Users]);
        }

        result
    }
}
