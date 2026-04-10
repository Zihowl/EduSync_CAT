use async_graphql::{SimpleObject, ID};

use crate::domain::models::school_year::SchoolYear;

#[derive(SimpleObject, Clone)]
pub struct SchoolYearType {
    pub id: ID,
    pub start_date: String,
    pub end_date: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<SchoolYear> for SchoolYearType {
    fn from(v: SchoolYear) -> Self {
        Self {
            id: ID(v.id.to_string()),
            start_date: v.start_date,
            end_date: v.end_date,
            created_at: v.created_at,
        }
    }
}
