use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_super_admin,
        graphql::{
            inputs::user_input::CreateAdminInput,
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
        let (user, _temp_password) = svc
            .create_admin(&input.email, &input.full_name)
            .await
            .map_err(to_gql_error)?;
        Ok(user.into())
    }
}
