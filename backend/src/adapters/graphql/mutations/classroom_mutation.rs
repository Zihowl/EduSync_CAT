use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            inputs::classroom_input::{CreateClassroomInput, UpdateClassroomInput},
            schema::to_gql_error,
            types::classroom_type::ClassroomType,
        },
    },
    domain::services::classroom_service::ClassroomService,
};

#[derive(Default)]
pub struct ClassroomMutation;

#[Object]
impl ClassroomMutation {
    #[graphql(name = "CreateClassroom")]
    async fn create_classroom(&self, ctx: &Context<'_>, input: CreateClassroomInput) -> async_graphql::Result<ClassroomType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ClassroomService>>()?;
        svc.create(&input.name, input.building_id)
            .await
            .map(Into::into)
            .map_err(to_gql_error)
    }

    #[graphql(name = "UpdateClassroom")]
    async fn update_classroom(&self, ctx: &Context<'_>, input: UpdateClassroomInput) -> async_graphql::Result<ClassroomType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ClassroomService>>()?;
        svc.update(input.id, input.name.as_deref(), Some(input.building_id))
            .await
            .map(Into::into)
            .map_err(to_gql_error)
    }

    #[graphql(name = "RemoveClassroom")]
    async fn remove_classroom(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<bool> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ClassroomService>>()?;
        svc.delete(id).await.map_err(to_gql_error)
    }
}
