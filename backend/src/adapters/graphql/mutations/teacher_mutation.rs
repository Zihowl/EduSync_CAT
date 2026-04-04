use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            inputs::teacher_input::{CreateTeacherInput, UpdateTeacherInput},
            realtime::{publish_realtime_event, RealtimeScope},
            schema::to_gql_error,
            types::teacher_type::TeacherType,
        },
    },
    domain::services::teacher_service::TeacherService,
};

#[derive(Default)]
pub struct TeacherMutation;

#[Object]
impl TeacherMutation {
    #[graphql(name = "CreateTeacher")]
    async fn create_teacher(&self, ctx: &Context<'_>, input: CreateTeacherInput) -> async_graphql::Result<TeacherType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<TeacherService>>()?;
        let result = svc.create(&input.employee_number, &input.name, input.email.as_deref())
            .await
            .map(Into::into)
            .map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Teachers, RealtimeScope::Schedules]);
        }
        result
    }

    #[graphql(name = "UpdateTeacher")]
    async fn update_teacher(&self, ctx: &Context<'_>, input: UpdateTeacherInput) -> async_graphql::Result<TeacherType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<TeacherService>>()?;
        let result = svc.update(
            input.id,
            input.employee_number.as_deref(),
            input.name.as_deref(),
            Some(input.email.as_deref()),
        )
        .await
        .map(Into::into)
        .map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Teachers, RealtimeScope::Schedules]);
        }
        result
    }

    #[graphql(name = "RemoveTeacher")]
    async fn remove_teacher(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<bool> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<TeacherService>>()?;
        let result = svc.delete(id).await.map_err(to_gql_error);
        if result.is_ok() {
            publish_realtime_event(ctx, &[RealtimeScope::Teachers, RealtimeScope::Schedules]);
        }
        result
    }
}
