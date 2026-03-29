use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::{
    domain::models::schedule_slot::ScheduleFilter,
    AppState,
};

#[derive(Deserialize)]
pub struct PublicScheduleQuery {
    pub group_id: Option<i32>,
    pub teacher_id: Option<i32>,
    pub classroom_id: Option<i32>,
    pub day_of_week: Option<i32>,
}

#[derive(Serialize)]
pub struct PublicScheduleDto {
    pub id: i32,
    pub teacher_id: i32,
    pub subject_id: i32,
    pub classroom_id: i32,
    pub group_id: i32,
    pub day_of_week: i32,
    pub start_time: String,
    pub end_time: String,
    pub subgroup: Option<String>,
}

pub async fn public_schedules(
    State(state): State<AppState>,
    Query(query): Query<PublicScheduleQuery>,
) -> Result<Json<Vec<PublicScheduleDto>>, (axum::http::StatusCode, String)> {
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
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.msg()))?;

    let out = data
        .into_iter()
        .map(|v| PublicScheduleDto {
            id: v.id,
            teacher_id: v.teacher_id,
            subject_id: v.subject_id,
            classroom_id: v.classroom_id,
            group_id: v.group_id,
            day_of_week: v.day_of_week,
            start_time: v.start_time,
            end_time: v.end_time,
            subgroup: v.subgroup,
        })
        .collect();

    Ok(Json(out))
}
