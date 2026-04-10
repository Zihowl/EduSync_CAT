use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            inputs::group_input::{CreateGroupInput, UpdateGroupInput},
            realtime::{publish_realtime_event, RealtimeScope},
            schema::to_gql_error,
            types::group_type::GroupType,
        },
    },
    domain::services::group_service::GroupService,
};

#[derive(Default)]
pub struct GroupMutation;

#[Object]
impl GroupMutation {
    #[graphql(name = "CreateGroup")]
    async fn create_group(
        &self,
        ctx: &Context<'_>,
        input: CreateGroupInput,
    ) -> async_graphql::Result<GroupType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<GroupService>>()?;
        let result = svc
            .create(&input.name, input.parent_id)
            .await
            .map(Into::into)
            .map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Groups, RealtimeScope::Schedules]);
        }
        result
    }

    #[graphql(name = "UpdateGroup")]
    async fn update_group(
        &self,
        ctx: &Context<'_>,
        input: UpdateGroupInput,
    ) -> async_graphql::Result<GroupType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<GroupService>>()?;
        let result = svc
            .update(input.id, input.name.as_deref(), Some(input.parent_id))
            .await
            .map(Into::into)
            .map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Groups, RealtimeScope::Schedules]);
        }
        result
    }

    #[graphql(name = "RemoveGroup")]
    async fn remove_group(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<bool> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<GroupService>>()?;
        let result = svc.delete(id).await.map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Groups, RealtimeScope::Schedules]);
        }
        result
    }
}
