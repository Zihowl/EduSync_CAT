use async_graphql::{ID, Json, SimpleObject};

use crate::domain::models::audit_log::{AuditLog, AuditLogPage};

#[derive(SimpleObject, Clone)]
pub struct AuditLogType {
    pub id: i64,
    pub actor_user_id: Option<ID>,
    pub actor_email: Option<String>,
    pub actor_role: String,
    pub action: String,
    pub resource_type: String,
    pub resource_id: Option<String>,
    pub details: Json<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<AuditLog> for AuditLogType {
    fn from(v: AuditLog) -> Self {
        Self {
            id: v.id,
            actor_user_id: v.actor_user_id.map(|id| ID(id.to_string())),
            actor_email: v.actor_email,
            actor_role: v.actor_role,
            action: v.action,
            resource_type: v.resource_type,
            resource_id: v.resource_id,
            details: Json(v.details),
            created_at: v.created_at,
        }
    }
}

#[derive(SimpleObject, Clone)]
pub struct AuditLogPageType {
    pub items: Vec<AuditLogType>,
    pub total_count: i64,
    pub page: i64,
    pub limit: i64,
}

impl From<AuditLogPage> for AuditLogPageType {
    fn from(v: AuditLogPage) -> Self {
        Self {
            items: v.items.into_iter().map(Into::into).collect(),
            total_count: v.total_count,
            page: v.page,
            limit: v.limit,
        }
    }
}