use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            inputs::subject_input::{CreateSubjectInput, UpdateSubjectInput},
            realtime::{publish_realtime_event, RealtimeScope},
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
    async fn create_subject(
        &self,
        ctx: &Context<'_>,
        input: CreateSubjectInput,
    ) -> async_graphql::Result<SubjectType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<SubjectService>>()?;
        let result = svc
            .create(
                &input.code,
                &input.name,
                input.grade,
                input.division.as_deref(),
            )
            .await
            .map(Into::into)
            .map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Subjects, RealtimeScope::Schedules]);
        }
        result
    }

    #[graphql(name = "UpdateSubject")]
    async fn update_subject(
        &self,
        ctx: &Context<'_>,
        input: UpdateSubjectInput,
    ) -> async_graphql::Result<SubjectType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<SubjectService>>()?;
        let result = svc
            .update(
                input.id,
                input.code.as_deref(),
                input.name.as_deref(),
                input.grade,
                input.division.as_deref(),
            )
            .await
            .map(Into::into)
            .map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Subjects, RealtimeScope::Schedules]);
        }
        result
    }

    #[graphql(name = "RemoveSubject")]
    async fn remove_subject(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<bool> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<SubjectService>>()?;
        let result = svc.delete(id).await.map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Subjects, RealtimeScope::Schedules]);
        }
        result
    }
}
