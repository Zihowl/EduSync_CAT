use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{auth::middleware::require_admin, graphql::{schema::to_gql_error, types::classroom_type::ClassroomType}},
    domain::services::classroom_service::ClassroomService,
};

#[derive(Default)]
pub struct ClassroomQuery;

#[Object]
impl ClassroomQuery {
    #[graphql(name = "GetClassrooms")]
    async fn get_classrooms(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<ClassroomType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ClassroomService>>()?;
        svc.find_all()
            .await
            .map(|v| v.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    #[graphql(name = "GetClassroom")]
    async fn get_classroom(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<Option<ClassroomType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ClassroomService>>()?;
        svc.find_one(id)
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}
