use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct CreateScheduleSlotInput {
    pub teacher_id: Option<i32>,
    pub subject_id: i32,
    pub classroom_id: i32,
    pub group_id: i32,
    pub day_of_week: i32,
    pub start_time: String,
    pub end_time: String,
    pub subgroup: Option<String>,
    pub is_published: Option<bool>,
}

#[derive(InputObject, Clone)]
pub struct UpdateScheduleSlotInput {
    pub id: i32,
    pub teacher_id: Option<Option<i32>>,
    pub subject_id: Option<i32>,
    pub classroom_id: Option<i32>,
    pub group_id: Option<i32>,
    pub day_of_week: Option<i32>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub subgroup: Option<String>,
    pub is_published: Option<bool>,
}

#[derive(InputObject, Clone)]
pub struct ScheduleFilterInput {
    pub teacher_id: Option<i32>,
    pub classroom_id: Option<i32>,
    pub group_id: Option<i32>,
    pub day_of_week: Option<i32>,
    pub is_published: Option<bool>,
    pub page: Option<i32>,
    pub limit: Option<i32>,
}
