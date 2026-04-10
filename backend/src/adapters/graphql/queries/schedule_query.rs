use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            inputs::schedule_input::ScheduleFilterInput, schema::to_gql_error,
            types::schedule_slot_type::ScheduleSlotType,
        },
    },
    domain::{models::schedule_slot::ScheduleFilter, services::schedule_service::ScheduleService},
};

#[derive(Default)]
pub struct ScheduleQuery;

#[Object]
impl ScheduleQuery {
    #[graphql(name = "GetSchedules")]
    async fn get_schedules(
        &self,
        ctx: &Context<'_>,
        filter: Option<ScheduleFilterInput>,
    ) -> async_graphql::Result<Vec<ScheduleSlotType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;

        let f = filter.unwrap_or(ScheduleFilterInput {
            teacher_id: None,
            classroom_id: None,
            group_id: None,
            day_of_week: None,
            is_published: None,
            page: Some(1),
            limit: Some(50),
        });

        svc.find_all(ScheduleFilter {
            teacher_id: f.teacher_id,
            classroom_id: f.classroom_id,
            group_id: f.group_id,
            day_of_week: f.day_of_week,
            is_published: f.is_published,
            page: f.page,
            limit: f.limit,
        })
        .await
        .map(|v| v.into_iter().map(Into::into).collect())
        .map_err(to_gql_error)
    }

    #[graphql(name = "GetSchedule")]
    async fn get_schedule(
        &self,
        ctx: &Context<'_>,
        id: i32,
    ) -> async_graphql::Result<Option<ScheduleSlotType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;
        svc.find_one(id)
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}
