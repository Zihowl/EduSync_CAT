use std::sync::Arc;

use async_graphql::Context;
use serde_json::Value;

use crate::{
    adapters::{
        auth::middleware::AuthUser,
        graphql::realtime::{publish_realtime_event, RealtimeScope},
    },
    domain::{models::audit_log::NewAuditLog, ports::audit_log_repository::AuditLogRepository},
};

pub async fn record_admin_audit(
    ctx: &Context<'_>,
    actor: &AuthUser,
    action: &str,
    resource_type: &str,
    resource_id: Option<String>,
    details: Value,
) {
    let Some(repo) = ctx.data_opt::<Arc<dyn AuditLogRepository>>().cloned() else {
        tracing::warn!(action = %action, resource_type = %resource_type, "AUDITORÍA: repositorio no disponible");
        return;
    };

    let entry = NewAuditLog {
        actor_user_id: Some(actor.user_id),
        actor_email: Some(actor.email.clone()),
        actor_role: actor.role.clone(),
        action: action.to_string(),
        resource_type: resource_type.to_string(),
        resource_id,
        details,
    };

    if let Err(err) = repo.create(entry).await {
        tracing::warn!(
            action = %action,
            resource_type = %resource_type,
            error = %err,
            "AUDITORÍA: no se pudo guardar el evento de auditoría"
        );
        return;
    }

    publish_realtime_event(ctx, &[RealtimeScope::AuditLogs]);
}
