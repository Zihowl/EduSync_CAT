use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::{require_admin, require_auth},
        graphql::{
            inputs::schedule_input::ScheduleFilterInput, schema::to_gql_error,
            types::schedule_slot_type::ScheduleSlotType,
        },
    },
    domain::{
        models::schedule_slot::ScheduleFilter,
        services::{schedule_service::ScheduleService, teacher_service::TeacherService},
    },
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

    /// Horario publicado de uno o varios grupos/subgrupos, accesible a
    /// cualquier usuario autenticado. `is_published` se fuerza a `true`, así
    /// los borradores nunca se exponen al alumno.
    #[graphql(name = "GetPublishedSchedule")]
    async fn get_published_schedule(
        &self,
        ctx: &Context<'_>,
        group_ids: Vec<i32>,
    ) -> async_graphql::Result<Vec<ScheduleSlotType>> {
        let _ = require_auth(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;

        let mut slots = Vec::new();
        for group_id in group_ids {
            let mut found = svc
                .find_all(ScheduleFilter {
                    group_id: Some(group_id),
                    is_published: Some(true),
                    page: Some(1),
                    limit: Some(500),
                    ..Default::default()
                })
                .await
                .map_err(to_gql_error)?;
            slots.append(&mut found);
        }

        Ok(slots.into_iter().map(Into::into).collect())
    }

    /// Horario publicado del docente autenticado. Resuelve al docente por el
    /// correo de la sesión contra el catálogo de docentes; si el correo no
    /// pertenece a un docente devuelve una lista vacía.
    #[graphql(name = "GetMyTeacherSchedule")]
    async fn get_my_teacher_schedule(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<ScheduleSlotType>> {
        let user = require_auth(ctx)?;
        let teacher_svc = ctx.data::<Arc<TeacherService>>()?;

        let teacher = teacher_svc
            .find_by_email(&user.email.to_lowercase())
            .await
            .map_err(to_gql_error)?;
        let Some(teacher) = teacher else {
            return Ok(Vec::new());
        };

        let svc = ctx.data::<Arc<ScheduleService>>()?;
        svc.find_all(ScheduleFilter {
            teacher_id: Some(teacher.id),
            is_published: Some(true),
            page: Some(1),
            limit: Some(500),
            ..Default::default()
        })
        .await
        .map(|v| v.into_iter().map(Into::into).collect())
        .map_err(to_gql_error)
    }

    /// Todos los bloques de horario publicados del plantel, accesibles a
    /// cualquier usuario autenticado. Permite al alumno consultar los horarios
    /// de los docentes (RQF-APP-54). `is_published` se fuerza a `true`, así los
    /// borradores nunca se exponen.
    #[graphql(name = "GetTeacherSchedules")]
    async fn get_teacher_schedules(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<ScheduleSlotType>> {
        let _ = require_auth(ctx)?;
        let svc = ctx.data::<Arc<ScheduleService>>()?;
        svc.find_all(ScheduleFilter {
            is_published: Some(true),
            page: Some(1),
            limit: Some(1000),
            ..Default::default()
        })
        .await
        .map(|v| v.into_iter().map(Into::into).collect())
        .map_err(to_gql_error)
    }
}
