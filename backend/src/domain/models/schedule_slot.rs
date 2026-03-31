use chrono::{DateTime, Utc};

#[derive(Clone, Debug)]
pub struct ScheduleSlot {
    pub id: i32,
    pub teacher_id: i32,
    pub subject_id: i32,
    pub classroom_id: i32,
    pub group_id: i32,
    pub day_of_week: i32,
    pub start_time: String,
    pub end_time: String,
    pub subgroup: Option<String>,
    pub is_published: bool,
    pub created_by_id: Option<uuid::Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Default)]
pub struct ScheduleFilter {
    pub teacher_id: Option<i32>,
    pub classroom_id: Option<i32>,
    pub group_id: Option<i32>,
    pub day_of_week: Option<i32>,
    pub is_published: Option<bool>,
    pub page: Option<i32>,
    pub limit: Option<i32>,
}
