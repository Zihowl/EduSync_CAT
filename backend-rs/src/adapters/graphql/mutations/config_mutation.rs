use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            schema::to_gql_error,
            types::{allowed_domain_type::AllowedDomainType, school_year_type::SchoolYearType},
        },
    },
    domain::services::config_service::ConfigService,
};

#[derive(Default)]
pub struct ConfigMutation;

#[Object]
impl ConfigMutation {
    #[graphql(name = "CreateAllowedDomain")]
    async fn create_allowed_domain(&self, ctx: &Context<'_>, domain: String) -> async_graphql::Result<AllowedDomainType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        svc.create_domain(&domain).await.map(Into::into).map_err(to_gql_error)
    }

    #[graphql(name = "RemoveAllowedDomain")]
    async fn remove_allowed_domain(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<bool> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        svc.remove_domain(id).await.map_err(to_gql_error)
    }

    #[graphql(name = "SetCurrentSchoolYear")]
    async fn set_current_school_year(
        &self,
        ctx: &Context<'_>,
        start_date: String,
        end_date: String,
    ) -> async_graphql::Result<SchoolYearType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        svc.set_current_school_year(&start_date, &end_date)
            .await
            .map(Into::into)
            .map_err(to_gql_error)
    }
}
