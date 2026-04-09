use async_graphql::InputObject;

#[derive(InputObject, Clone, Default)]
pub struct AuditLogFilterInput {
    pub action: Option<String>,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub actor_email: Option<String>,
    pub actor_role: Option<String>,
    pub search: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub page: Option<i32>,
    pub limit: Option<i32>,
}