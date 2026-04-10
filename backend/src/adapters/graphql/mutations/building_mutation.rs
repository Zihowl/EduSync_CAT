use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            inputs::building_input::{CreateBuildingInput, UpdateBuildingInput},
            realtime::{publish_realtime_event, RealtimeScope},
            schema::to_gql_error,
            types::building_type::BuildingType,
        },
    },
    domain::services::building_service::BuildingService,
};

#[derive(Default)]
pub struct BuildingMutation;

#[Object]
impl BuildingMutation {
    #[graphql(name = "CreateBuilding")]
    async fn create_building(
        &self,
        ctx: &Context<'_>,
        input: CreateBuildingInput,
    ) -> async_graphql::Result<BuildingType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<BuildingService>>()?;
        let result = svc
            .create(&input.name, input.description.as_deref())
            .await
            .map(Into::into)
            .map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Buildings, RealtimeScope::Classrooms]);
        }
        result
    }

    #[graphql(name = "UpdateBuilding")]
    async fn update_building(
        &self,
        ctx: &Context<'_>,
        input: UpdateBuildingInput,
    ) -> async_graphql::Result<BuildingType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<BuildingService>>()?;
        let result = svc
            .update(
                input.id,
                input.name.as_deref(),
                Some(input.description.as_deref()),
            )
            .await
            .map(Into::into)
            .map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Buildings, RealtimeScope::Classrooms]);
        }
        result
    }

    #[graphql(name = "RemoveBuilding")]
    async fn remove_building(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<bool> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<BuildingService>>()?;
        let result = svc.delete(id).await.map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Buildings, RealtimeScope::Classrooms]);
        }
        result
    }
}
