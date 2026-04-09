use std::sync::Arc;

use async_graphql::{Context, Object};
use serde_json::json;

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            audit::record_admin_audit,
            realtime::{publish_realtime_event, RealtimeScope},
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
        let auth_user = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        let result: async_graphql::Result<AllowedDomainType> = svc
            .create_domain(&domain)
            .await
            .map_err(to_gql_error)
            .map(AllowedDomainType::from);
        if result.is_ok() {
            if let Ok(created_domain) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "create_allowed_domain",
                    "allowed_domain",
                    Some(created_domain.id.to_string()),
                    json!({
                        "domain": created_domain.domain
                    }),
                ).await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::AllowedDomains, RealtimeScope::Users]);
        }
        result
    }

    #[graphql(name = "RemoveAllowedDomain")]
    async fn remove_allowed_domain(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<bool> {
        let auth_user = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        let result = svc.remove_domain(id).await.map_err(to_gql_error);
        if result.is_ok() {
            record_admin_audit(
                ctx,
                &auth_user,
                "remove_allowed_domain",
                "allowed_domain",
                Some(id.to_string()),
                json!({
                    "domain_id": id
                }),
            ).await;

            publish_realtime_event(ctx, &[RealtimeScope::AllowedDomains, RealtimeScope::Users]);
        }
        result
    }

    #[graphql(name = "SetCurrentSchoolYear")]
    async fn set_current_school_year(
        &self,
        ctx: &Context<'_>,
        start_date: String,
        end_date: String,
    ) -> async_graphql::Result<SchoolYearType> {
        let auth_user = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        let result: async_graphql::Result<SchoolYearType> = svc.set_current_school_year(&start_date, &end_date)
            .await
            .map(SchoolYearType::from)
            .map_err(to_gql_error);
        if result.is_ok() {
            if let Ok(school_year) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "set_current_school_year",
                    "school_year",
                    Some(school_year.id.to_string()),
                    json!({
                        "start_date": start_date,
                        "end_date": end_date
                    }),
                ).await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::CurrentSchoolYear]);
        }
        result
    }
}
