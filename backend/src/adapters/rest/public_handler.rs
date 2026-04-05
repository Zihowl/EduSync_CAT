use std::{collections::HashSet, sync::Arc};

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use futures_util::future::try_join_all;
use serde::{Deserialize, Serialize};

use crate::{
    domain::{
        models::{
            group::Group,
            schedule_slot::{ScheduleFilter, ScheduleSlot},
        },
        services::group_service::GroupService,
    },
    AppState,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicScheduleQuery {
    pub group_id: Option<i32>,
    pub teacher_id: Option<i32>,
    pub classroom_id: Option<i32>,
    pub day_of_week: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicTeacherDto {
    pub id: i32,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicSubjectDto {
    pub id: i32,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicClassroomDto {
    pub id: i32,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicGroupDto {
    pub id: i32,
    pub name: String,
    pub parent: Option<Box<PublicGroupDto>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicScheduleDto {
    pub id: i32,
    pub day_of_week: i32,
    pub start_time: String,
    pub end_time: String,
    pub subgroup: Option<String>,
    pub teacher: Option<PublicTeacherDto>,
    pub subject: PublicSubjectDto,
    pub classroom: PublicClassroomDto,
    pub group: PublicGroupDto,
}

pub async fn public_schedules(
    State(state): State<AppState>,
    Query(query): Query<PublicScheduleQuery>,
) -> Result<Json<Vec<PublicScheduleDto>>, (StatusCode, String)> {
    let data = state
        .schedule_service
        .find_all(ScheduleFilter {
            teacher_id: query.teacher_id,
            classroom_id: query.classroom_id,
            group_id: query.group_id,
            day_of_week: query.day_of_week,
            is_published: Some(true),
            page: Some(1),
            limit: Some(500),
        })
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.msg()))?;

    let out = try_join_all(data.into_iter().map(|slot| build_public_schedule(&state, slot)))
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;

    Ok(Json(out))
}

async fn build_public_schedule(
    state: &AppState,
    slot: ScheduleSlot,
) -> Result<PublicScheduleDto, String> {
    let teacher = match slot.teacher_id {
        Some(teacher_id) => state
            .teacher_service
            .find_one(teacher_id)
            .await
            .map_err(|e| e.msg())?
            .map(|teacher| PublicTeacherDto {
                id: teacher.id,
                name: teacher.name,
            }),
        None => None,
    };

    let subject = state
        .subject_service
        .find_one(slot.subject_id)
        .await
        .map_err(|e| e.msg())?
        .ok_or_else(|| "Materia no encontrada".to_string())?;

    let classroom = state
        .classroom_service
        .find_one(slot.classroom_id)
        .await
        .map_err(|e| e.msg())?
        .ok_or_else(|| "Salon no encontrado".to_string())?;

    let group = build_public_group(&state.group_service, slot.group_id).await?;

    Ok(PublicScheduleDto {
        id: slot.id,
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        subgroup: slot.subgroup,
        teacher,
        subject: PublicSubjectDto {
            id: subject.id,
            name: subject.name,
        },
        classroom: PublicClassroomDto {
            id: classroom.id,
            name: classroom.name,
        },
        group,
    })
}

async fn build_public_group(
    group_service: &Arc<GroupService>,
    group_id: i32,
) -> Result<PublicGroupDto, String> {
    let mut chain: Vec<Group> = Vec::new();
    let mut current_group_id = Some(group_id);
    let mut visited = HashSet::new();

    while let Some(id) = current_group_id {
        if !visited.insert(id) {
            return Err("La jerarquía de grupos contiene un ciclo".to_string());
        }

        let group = group_service
            .find_one(id)
            .await
            .map_err(|e| e.msg())?
            .ok_or_else(|| "Grupo no encontrado".to_string())?;

        current_group_id = group.parent_id;
        chain.push(group);
    }

    let mut parent: Option<Box<PublicGroupDto>> = None;

    for group in chain.into_iter().rev() {
        parent = Some(Box::new(PublicGroupDto {
            id: group.id,
            name: group.name,
            parent,
        }));
    }

    parent
        .map(|group| *group)
        .ok_or_else(|| "Grupo no encontrado".to_string())
}
