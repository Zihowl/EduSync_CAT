use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            inputs::schedule_input::{CreateScheduleSlotInput, UpdateScheduleSlotInput},
            schema::to_gql_error,
            types::schedule_slot_type::ScheduleSlotType,
        },
    },
    domain::services::schedule_service::{CreateScheduleSlot, ScheduleService, UpdateScheduleSlot},
};

#[derive(Default)]
pub struct ScheduleMutation;

#[Object]
impl ScheduleMutation {
    #[graphql(name = "CreateScheduleSlot")]
    async fn create_schedule_slot(
        &self,
        ctx: &Context<'_>,
        input: CreateScheduleSlotInput,
    ) -> async_graphql::Result<ScheduleSlotType> {
        let auth_user = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;

        svc.create(CreateScheduleSlot {
            teacher_id: input.teacher_id,
            subject_id: input.subject_id,
            classroom_id: input.classroom_id,
            group_id: input.group_id,
            day_of_week: input.day_of_week,
            start_time: input.start_time,
            end_time: input.end_time,
            subgroup: input.subgroup,
            is_published: input.is_published.unwrap_or(false),
            created_by_id: Some(auth_user.user_id),
        })
        .await
        .map(Into::into)
        .map_err(to_gql_error)
    }

    #[graphql(name = "UpdateScheduleSlot")]
    async fn update_schedule_slot(
        &self,
        ctx: &Context<'_>,
        input: UpdateScheduleSlotInput,
    ) -> async_graphql::Result<ScheduleSlotType> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;

        svc.update(UpdateScheduleSlot {
            id: input.id,
            teacher_id: input.teacher_id,
            subject_id: input.subject_id,
            classroom_id: input.classroom_id,
            group_id: input.group_id,
            day_of_week: input.day_of_week,
            start_time: input.start_time,
            end_time: input.end_time,
            subgroup: Some(input.subgroup),
            is_published: input.is_published,
        })
        .await
        .map(Into::into)
        .map_err(to_gql_error)
    }

    #[graphql(name = "RemoveScheduleSlot")]
    async fn remove_schedule_slot(&self, ctx: &Context<'_>, id: i32) -> async_graphql::Result<bool> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;
        svc.remove(id).await.map_err(to_gql_error)
    }

    #[graphql(name = "SetSchedulesPublished")]
    async fn set_schedules_published(
        &self,
        ctx: &Context<'_>,
        ids: Vec<i32>,
        is_published: bool,
    ) -> async_graphql::Result<i64> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;
        svc.set_published(&ids, is_published).await.map_err(to_gql_error)
    }
}
