use std::sync::Arc;

use async_graphql::{Context, Object};
use serde_json::json;

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{
            audit::record_admin_audit,
            inputs::schedule_input::{CreateScheduleSlotInput, UpdateScheduleSlotInput},
            realtime::{publish_realtime_event, RealtimeScope},
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
        let teacher_id = input.teacher_id;
        let subject_id = input.subject_id;
        let classroom_id = input.classroom_id;
        let group_id = input.group_id;
        let day_of_week = input.day_of_week;
        let start_time = input.start_time.clone();
        let end_time = input.end_time.clone();
        let subgroup = input.subgroup.clone();
        let is_published = input.is_published.unwrap_or(false);

        let result: async_graphql::Result<ScheduleSlotType> = svc
            .create(CreateScheduleSlot {
                teacher_id,
                subject_id,
                classroom_id,
                group_id,
                day_of_week,
                start_time: start_time.clone(),
                end_time: end_time.clone(),
                subgroup: subgroup.clone(),
                is_published,
                created_by_id: Some(auth_user.user_id),
            })
            .await
            .map(ScheduleSlotType::from)
            .map_err(to_gql_error);
        if result.is_ok() {
            if let Ok(schedule) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "create_schedule_slot",
                    "schedule_slot",
                    Some(schedule.id.to_string()),
                    json!({
                        "teacher_id": teacher_id,
                        "subject_id": subject_id,
                        "classroom_id": classroom_id,
                        "group_id": group_id,
                        "day_of_week": day_of_week,
                        "start_time": start_time,
                        "end_time": end_time,
                        "subgroup": subgroup,
                        "is_published": is_published
                    }),
                )
                .await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::Schedules]);
        }
        result
    }

    #[graphql(name = "CreateScheduleSlots")]
    async fn create_schedule_slots(
        &self,
        ctx: &Context<'_>,
        inputs: Vec<CreateScheduleSlotInput>,
    ) -> async_graphql::Result<Vec<ScheduleSlotType>> {
        let auth_user = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;
        let audit_inputs = inputs.clone();

        let payloads = inputs
            .into_iter()
            .map(|input| CreateScheduleSlot {
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
            .collect();

        let result: async_graphql::Result<Vec<ScheduleSlotType>> = svc
            .create_many(payloads)
            .await
            .map(|slots| slots.into_iter().map(ScheduleSlotType::from).collect())
            .map_err(to_gql_error);

        if let Ok(created_schedules) = &result {
            for (schedule, input) in created_schedules.iter().zip(audit_inputs.iter()) {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "create_schedule_slot",
                    "schedule_slot",
                    Some(schedule.id.to_string()),
                    json!({
                        "teacher_id": input.teacher_id,
                        "subject_id": input.subject_id,
                        "classroom_id": input.classroom_id,
                        "group_id": input.group_id,
                        "day_of_week": input.day_of_week,
                        "start_time": input.start_time,
                        "end_time": input.end_time,
                        "subgroup": input.subgroup,
                        "is_published": input.is_published.unwrap_or(false)
                    }),
                )
                .await;
            }

            if !created_schedules.is_empty() {
                publish_realtime_event(ctx, &[RealtimeScope::Schedules]);
            }
        }

        result
    }

    #[graphql(name = "UpdateScheduleSlot")]
    async fn update_schedule_slot(
        &self,
        ctx: &Context<'_>,
        input: UpdateScheduleSlotInput,
    ) -> async_graphql::Result<ScheduleSlotType> {
        let auth_user = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;
        let id = input.id;
        let teacher_id = input.teacher_id;
        let subject_id = input.subject_id;
        let classroom_id = input.classroom_id;
        let group_id = input.group_id;
        let day_of_week = input.day_of_week;
        let start_time = input.start_time.clone();
        let end_time = input.end_time.clone();
        let subgroup = input.subgroup.clone();
        let is_published = input.is_published;

        let result: async_graphql::Result<ScheduleSlotType> = svc
            .update(UpdateScheduleSlot {
                id,
                teacher_id,
                subject_id,
                classroom_id,
                group_id,
                day_of_week,
                start_time: start_time.clone(),
                end_time: end_time.clone(),
                subgroup: Some(subgroup.clone()),
                is_published,
            })
            .await
            .map(ScheduleSlotType::from)
            .map_err(to_gql_error);
        if result.is_ok() {
            if let Ok(schedule) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "update_schedule_slot",
                    "schedule_slot",
                    Some(schedule.id.to_string()),
                    json!({
                        "teacher_id": teacher_id,
                        "subject_id": subject_id,
                        "classroom_id": classroom_id,
                        "group_id": group_id,
                        "day_of_week": day_of_week,
                        "start_time": start_time,
                        "end_time": end_time,
                        "subgroup": subgroup,
                        "is_published": is_published
                    }),
                )
                .await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::Schedules]);
        }
        result
    }

    #[graphql(name = "RemoveScheduleSlot")]
    async fn remove_schedule_slot(
        &self,
        ctx: &Context<'_>,
        id: i32,
    ) -> async_graphql::Result<bool> {
        let auth_user = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;
        let result = svc.remove(id).await.map_err(to_gql_error);
        if result.is_ok() {
            record_admin_audit(
                ctx,
                &auth_user,
                "remove_schedule_slot",
                "schedule_slot",
                Some(id.to_string()),
                json!({
                    "schedule_id": id
                }),
            )
            .await;

            publish_realtime_event(ctx, &[RealtimeScope::Schedules]);
        }
        result
    }

    #[graphql(name = "SetSchedulesPublished")]
    async fn set_schedules_published(
        &self,
        ctx: &Context<'_>,
        ids: Vec<i32>,
        is_published: bool,
    ) -> async_graphql::Result<i64> {
        let auth_user = require_admin(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;
        let result = svc
            .set_published(&ids, is_published)
            .await
            .map_err(to_gql_error);
        if result.is_ok() {
            record_admin_audit(
                ctx,
                &auth_user,
                "set_schedules_published",
                "schedule_batch",
                None,
                json!({
                    "schedule_ids": ids,
                    "is_published": is_published
                }),
            )
            .await;

            publish_realtime_event(ctx, &[RealtimeScope::Schedules]);
        }
        result
    }
}
