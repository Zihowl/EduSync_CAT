use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{auth::middleware::require_admin, graphql::{schema::to_gql_error, types::building_type::BuildingType}},
    domain::services::building_service::BuildingService,
};

#[derive(Default)]
pub struct BuildingQuery;

#[Object]
impl BuildingQuery {
    #[graphql(name = "GetBuildings")]
    async fn get_buildings(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<BuildingType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<BuildingService>>()?;
        svc.find_all()
            .await
            .map(|v| v.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    #[graphql(name = "GetBuilding")]
    async fn get_building(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<Option<BuildingType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<BuildingService>>()?;
        svc.find_one(id)
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}
