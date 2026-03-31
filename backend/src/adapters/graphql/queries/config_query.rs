use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::graphql::{
        schema::to_gql_error,
        types::{allowed_domain_type::AllowedDomainType, school_year_type::SchoolYearType},
    },
    domain::services::config_service::ConfigService,
};

#[derive(Default)]
pub struct ConfigQuery;

#[Object]
impl ConfigQuery {
    #[graphql(name = "GetAllowedDomains")]
    async fn get_allowed_domains(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<AllowedDomainType>> {
        let svc = ctx.data::<Arc<ConfigService>>()?;
        svc.get_allowed_domains()
            .await
            .map(|v| v.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    #[graphql(name = "GetCurrentSchoolYear")]
    async fn get_current_school_year(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<SchoolYearType>> {
        let svc = ctx.data::<Arc<ConfigService>>()?;
        svc.get_current_school_year()
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}
