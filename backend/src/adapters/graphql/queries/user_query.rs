use std::sync::Arc;

use async_graphql::{Context, Object, Error as GqlError};

use crate::{
    adapters::{auth::middleware::{require_admin, AuthUser}, graphql::{schema::to_gql_error, types::user_type::UserType}},
    domain::services::user_service::UserService,
};

#[derive(Default)]
pub struct UserQuery;

#[Object]
impl UserQuery {
    #[graphql(name = "GetUsers")]
    async fn get_users(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<UserType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<UserService>>()?;
        svc.find_all()
            .await
            .map(|v| v.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    #[graphql(name = "VerifySession")]
    async fn verify_session(&self, ctx: &Context<'_>) -> async_graphql::Result<UserType> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .cloned()
            .ok_or_else(|| GqlError::new("Unauthorized"))?;
        
        let svc = ctx.data::<Arc<UserService>>()?;
        
        match svc.find_by_email(&auth_user.email).await {
            Ok(Some(user)) => Ok(user.into()),
            Ok(None) => Err(GqlError::new("User not found")),
            Err(e) => Err(to_gql_error(e))
        }
    }
}
