use std::sync::Arc;

use async_graphql::{Context, Object};
use chrono::NaiveDate;

use crate::{
    adapters::{
        auth::middleware::require_super_admin,
        graphql::{
            inputs::audit_log_input::AuditLogFilterInput, schema::to_gql_error,
            types::audit_log_type::AuditLogPageType,
        },
    },
    domain::{models::audit_log::AuditLogFilter, ports::audit_log_repository::AuditLogRepository},
};

#[derive(Default)]
pub struct AuditLogQuery;

#[Object]
impl AuditLogQuery {
    #[graphql(name = "GetAuditLogs")]
    async fn get_audit_logs(
        &self,
        ctx: &Context<'_>,
        filter: Option<AuditLogFilterInput>,
    ) -> async_graphql::Result<AuditLogPageType> {
        let _ = require_super_admin(ctx)?;
        let repo = ctx.data::<Arc<dyn AuditLogRepository>>()?;
        let input = filter.unwrap_or_default();

        let page = input.page.unwrap_or(1).max(1) as i64;
        let limit = input.limit.unwrap_or(25).clamp(1, 100) as i64;

        let from_date = parse_date(input.from_date.as_deref())?;
        let to_date = parse_date(input.to_date.as_deref())?;

        repo.find_page(AuditLogFilter {
            action: trim_optional(input.action),
            resource_type: trim_optional(input.resource_type),
            resource_id: trim_optional(input.resource_id),
            actor_email: trim_optional(input.actor_email),
            actor_role: trim_optional(input.actor_role),
            search: trim_optional(input.search),
            from_date,
            to_date,
            page: Some(page),
            limit: Some(limit),
        })
        .await
        .map(Into::into)
        .map_err(to_gql_error)
    }
}

fn trim_optional(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

fn parse_date(value: Option<&str>) -> async_graphql::Result<Option<NaiveDate>> {
    match value {
        Some(raw) if !raw.trim().is_empty() => NaiveDate::parse_from_str(raw.trim(), "%Y-%m-%d")
            .map(Some)
            .map_err(|_| async_graphql::Error::new("Formato de fecha inválido. Usa YYYY-MM-DD")),
        _ => Ok(None),
    }
}
