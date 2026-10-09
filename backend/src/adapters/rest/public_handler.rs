use axum::{
    extract::{Query, State},
    http::{header::CACHE_CONTROL, HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{domain::models::schedule_slot::ScheduleFilter, AppState};

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
    pub grade: Option<i32>,
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

/// Endpoint público de consulta de horarios escolares.
/// Optimizado con una única consulta SQL con JOINs para evitar el problema N+1
/// y con cabeceras Cache-Control para descargar a PostgreSQL bajo ráfagas concurrentes.
pub async fn public_schedules(
    State(state): State<AppState>,
    Query(query): Query<PublicScheduleQuery>,
) -> Result<(HeaderMap, Json<Vec<PublicScheduleDto>>), (StatusCode, String)> {
    let slots = state
        .schedule_service
        .find_all_detailed(ScheduleFilter {
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

    let out = slots
        .into_iter()
        .map(|slot| {
            let parent = slot.group_parent_id.map(|parent_id| {
                Box::new(PublicGroupDto {
                    id: parent_id,
                    name: slot.parent_group_name.clone().unwrap_or_default(),
                    parent: None,
                })
            });

            PublicScheduleDto {
                id: slot.id,
                day_of_week: slot.day_of_week,
                start_time: slot.start_time,
                end_time: slot.end_time,
                subgroup: slot.subgroup,
                teacher: slot.teacher_id.map(|id| PublicTeacherDto {
                    id,
                    name: slot.teacher_name.unwrap_or_default(),
                }),
                subject: PublicSubjectDto {
                    id: slot.subject_id,
                    name: slot.subject_name,
                    grade: slot.subject_grade,
                },
                classroom: PublicClassroomDto {
                    id: slot.classroom_id,
                    name: slot.classroom_name,
                },
                group: PublicGroupDto {
                    id: slot.group_id,
                    name: slot.group_name,
                    parent,
                },
            }
        })
        .collect();

    let mut headers = HeaderMap::new();
    headers.insert(
        CACHE_CONTROL,
        "public, max-age=60, stale-while-revalidate=300".parse().unwrap(),
    );

    Ok((headers, Json(out)))
}
