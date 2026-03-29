use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{auth::middleware::require_admin, graphql::{schema::to_gql_error, types::group_type::GroupType}},
    domain::services::group_service::GroupService,
};

#[derive(Default)]
pub struct GroupQuery;

#[Object]
impl GroupQuery {
    #[graphql(name = "GetGroups")]
    async fn get_groups(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<GroupType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<GroupService>>()?;
        svc.find_all()
            .await
            .map(|v| v.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    #[graphql(name = "GetGroup")]
    async fn get_group(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<Option<GroupType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<GroupService>>()?;
        svc.find_one(id)
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}
