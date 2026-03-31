use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            inputs::subject_input::{CreateSubjectInput, UpdateSubjectInput},
            schema::to_gql_error,
            types::subject_type::SubjectType,
        },
    },
    domain::services::subject_service::SubjectService,
};

#[derive(Default)]
pub struct SubjectMutation;

#[Object]
impl SubjectMutation {
    #[graphql(name = "CreateSubject")]
    async fn create_subject(&self, ctx: &Context<'_>, input: CreateSubjectInput) -> async_graphql::Result<SubjectType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<SubjectService>>()?;
        svc.create(&input.code, &input.name)
            .await
            .map(Into::into)
            .map_err(to_gql_error)
    }

    #[graphql(name = "UpdateSubject")]
    async fn update_subject(&self, ctx: &Context<'_>, input: UpdateSubjectInput) -> async_graphql::Result<SubjectType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<SubjectService>>()?;
        svc.update(input.id, input.code.as_deref(), input.name.as_deref())
            .await
            .map(Into::into)
            .map_err(to_gql_error)
    }

    #[graphql(name = "RemoveSubject")]
    async fn remove_subject(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<bool> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<SubjectService>>()?;
        svc.delete(id).await.map_err(to_gql_error)
    }
}
