use async_trait::async_trait;
use sqlx::{FromRow, PgPool};

use crate::domain::{
    errors::DomainError,
    models::allowed_domain::AllowedDomain,
    ports::allowed_domain_repository::AllowedDomainRepository,
};

#[derive(Clone)]
pub struct PgAllowedDomainRepository {
    pool: PgPool,
}

impl PgAllowedDomainRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct AllowedDomainRow {
    id: i32,
    domain: String,
}

impl From<AllowedDomainRow> for AllowedDomain {
    fn from(v: AllowedDomainRow) -> Self {
        Self { id: v.id, domain: v.domain }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en dominios permitidos: {e}"))
}

#[async_trait]
impl AllowedDomainRepository for PgAllowedDomainRepository {
    async fn find_all(&self) -> Result<Vec<AllowedDomain>, DomainError> {
        let rows = sqlx::query_as::<_, AllowedDomainRow>("SELECT id, domain FROM allowed_domains ORDER BY id DESC")
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find_by_domain(&self, domain: &str) -> Result<Option<AllowedDomain>, DomainError> {
        let row = sqlx::query_as::<_, AllowedDomainRow>("SELECT id, domain FROM allowed_domains WHERE domain = $1")
            .bind(domain)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn create(&self, domain: &str) -> Result<AllowedDomain, DomainError> {
        let row = sqlx::query_as::<_, AllowedDomainRow>(
            "INSERT INTO allowed_domains (domain) VALUES ($1) RETURNING id, domain",
        )
        .bind(domain)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        let result = sqlx::query("DELETE FROM allowed_domains WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }
}
