use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::{postgres::Postgres, types::Json, FromRow, PgPool, QueryBuilder};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::audit_log::{AuditLog, AuditLogFilter, AuditLogPage, NewAuditLog},
    ports::audit_log_repository::AuditLogRepository,
};

#[derive(Clone)]
pub struct PgAuditLogRepository {
    pool: PgPool,
}

impl PgAuditLogRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct AuditLogRow {
    id: i64,
    actor_user_id: Option<Uuid>,
    actor_email: Option<String>,
    actor_role: String,
    action: String,
    resource_type: String,
    resource_id: Option<String>,
    details: Json<Value>,
    created_at: DateTime<Utc>,
}

impl From<AuditLogRow> for AuditLog {
    fn from(v: AuditLogRow) -> Self {
        Self {
            id: v.id,
            actor_user_id: v.actor_user_id,
            actor_email: v.actor_email,
            actor_role: v.actor_role,
            action: v.action,
            resource_type: v.resource_type,
            resource_id: v.resource_id,
            details: v.details.0,
            created_at: v.created_at,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!(
        "Error de base de datos en registros de auditoría: {e}"
    ))
}

fn apply_filters<'a>(
    mut builder: QueryBuilder<'a, Postgres>,
    filter: &'a AuditLogFilter,
) -> QueryBuilder<'a, Postgres> {
    builder.push(" WHERE 1 = 1");

    if let Some(action) = filter.action.as_deref() {
        builder.push(" AND action = ").push_bind(action);
    }

    if let Some(resource_type) = filter.resource_type.as_deref() {
        builder
            .push(" AND resource_type = ")
            .push_bind(resource_type);
    }

    if let Some(resource_id) = filter.resource_id.as_deref() {
        builder.push(" AND resource_id = ").push_bind(resource_id);
    }

    if let Some(actor_email) = filter.actor_email.as_deref() {
        let pattern = format!("%{}%", actor_email.trim());
        builder.push(" AND actor_email ILIKE ").push_bind(pattern);
    }

    if let Some(actor_role) = filter.actor_role.as_deref() {
        builder.push(" AND actor_role = ").push_bind(actor_role);
    }

    if let Some(from_date) = filter.from_date {
        builder
            .push(" AND created_at::date >= ")
            .push_bind(from_date);
    }

    if let Some(to_date) = filter.to_date {
        builder.push(" AND created_at::date <= ").push_bind(to_date);
    }

    if let Some(search) = filter.search.as_deref() {
        let pattern = format!("%{}%", search.trim());
        builder
            .push(" AND (")
            .push("action ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR resource_type ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(actor_email, '') ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR COALESCE(resource_id, '') ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR details::text ILIKE ")
            .push_bind(pattern)
            .push(")");
    }

    builder
}

#[async_trait]
impl AuditLogRepository for PgAuditLogRepository {
    async fn create(&self, entry: NewAuditLog) -> Result<AuditLog, DomainError> {
        let row = sqlx::query_as::<_, AuditLogRow>(
            "INSERT INTO audit_logs (actor_user_id, actor_email, actor_role, action, resource_type, resource_id, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, actor_user_id, actor_email, actor_role, action, resource_type, resource_id, details, created_at",
        )
        .bind(entry.actor_user_id)
        .bind(entry.actor_email)
        .bind(entry.actor_role)
        .bind(entry.action)
        .bind(entry.resource_type)
        .bind(entry.resource_id)
        .bind(Json(entry.details))
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.into())
    }

    async fn find_page(&self, filter: AuditLogFilter) -> Result<AuditLogPage, DomainError> {
        let page = filter.page.unwrap_or(1).max(1);
        let limit = filter.limit.unwrap_or(25).clamp(1, 100);
        let offset = (page - 1) * limit;

        let mut count_builder = apply_filters(
            QueryBuilder::<Postgres>::new("SELECT COUNT(*) FROM audit_logs"),
            &filter,
        );
        let total_count: i64 = count_builder
            .build_query_scalar()
            .fetch_one(&self.pool)
            .await
            .map_err(map_sqlx)?;

        let mut list_builder = apply_filters(
            QueryBuilder::<Postgres>::new(
            "SELECT id, actor_user_id, actor_email, actor_role, action, resource_type, resource_id, details, created_at FROM audit_logs",
        ),
            &filter,
        );
        list_builder.push(" ORDER BY created_at DESC, id DESC");
        list_builder.push(" LIMIT ").push_bind(limit);
        list_builder.push(" OFFSET ").push_bind(offset);

        let rows = list_builder
            .build_query_as::<AuditLogRow>()
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx)?;

        Ok(AuditLogPage {
            items: rows.into_iter().map(Into::into).collect(),
            total_count,
            page,
            limit,
        })
    }

    async fn delete_older_than_months(&self, months: i32) -> Result<u64, DomainError> {
        let result = sqlx::query(
            "DELETE FROM audit_logs WHERE created_at < NOW() - ($1 * INTERVAL '1 month')",
        )
        .bind(months.max(0))
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(result.rows_affected())
    }
}
