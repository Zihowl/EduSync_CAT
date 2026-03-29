use chrono::{DateTime, Utc};

#[derive(Clone, Debug)]
pub struct SchoolYear {
    pub id: i32,
    pub start_date: String,
    pub end_date: String,
    pub created_at: DateTime<Utc>,
}
