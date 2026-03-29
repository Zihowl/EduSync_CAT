use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{auth::middleware::require_admin, graphql::{schema::to_gql_error, types::subject_type::SubjectType}},
    domain::services::subject_service::SubjectService,
};

#[derive(Default)]
pub struct SubjectQuery;

#[Object]
impl SubjectQuery {
    #[graphql(name = "GetSubjects")]
    async fn get_subjects(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<SubjectType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<SubjectService>>()?;
        svc.find_all()
            .await
            .map(|v| v.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    #[graphql(name = "GetSubject")]
    async fn get_subject(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<Option<SubjectType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<SubjectService>>()?;
        svc.find_one(id)
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}
