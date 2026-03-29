use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{auth::middleware::require_admin, graphql::{schema::to_gql_error, types::user_type::UserType}},
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
}
