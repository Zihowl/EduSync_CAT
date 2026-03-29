use async_graphql::{ID, SimpleObject};

#[derive(SimpleObject, Clone)]
pub struct ScheduleSlotType {
    pub id: ID,
    pub teacher_id: i32,
    pub subject_id: i32,
    pub classroom_id: i32,
    pub group_id: i32,
    pub day_of_week: i32,
    pub start_time: String,
    pub end_time: String,
    pub subgroup: Option<String>,
    pub is_published: bool,
    pub created_by_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<crate::domain::models::schedule_slot::ScheduleSlot> for ScheduleSlotType {
    fn from(v: crate::domain::models::schedule_slot::ScheduleSlot) -> Self {
        Self {
            id: ID(v.id.to_string()),
            teacher_id: v.teacher_id,
            subject_id: v.subject_id,
            classroom_id: v.classroom_id,
            group_id: v.group_id,
            day_of_week: v.day_of_week,
            start_time: v.start_time,
            end_time: v.end_time,
            subgroup: v.subgroup,
            is_published: v.is_published,
            created_by_id: v.created_by_id.map(|x| x.to_string()),
            created_at: v.created_at,
            updated_at: v.updated_at,
        }
    }
}
