use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct AuditLog {
    pub id: i64,
    pub actor_user_id: Option<Uuid>,
    pub actor_email: Option<String>,
    pub actor_role: String,
    pub action: String,
    pub resource_type: String,
    pub resource_id: Option<String>,
    pub details: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub struct NewAuditLog {
    pub actor_user_id: Option<Uuid>,
    pub actor_email: Option<String>,
    pub actor_role: String,
    pub action: String,
    pub resource_type: String,
    pub resource_id: Option<String>,
    pub details: Value,
}

#[derive(Clone, Debug, Default)]
pub struct AuditLogFilter {
    pub action: Option<String>,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub actor_email: Option<String>,
    pub actor_role: Option<String>,
    pub search: Option<String>,
    pub from_date: Option<NaiveDate>,
    pub to_date: Option<NaiveDate>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Clone, Debug)]
pub struct AuditLogPage {
    pub items: Vec<AuditLog>,
    pub total_count: i64,
    pub page: i64,
    pub limit: i64,
}
