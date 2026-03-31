use async_graphql::{ID, SimpleObject};

use crate::domain::models::classroom::Classroom;

#[derive(SimpleObject, Clone)]
pub struct ClassroomType {
    pub id: ID,
    pub name: String,
    pub building_id: Option<i32>,
}

impl From<Classroom> for ClassroomType {
    fn from(v: Classroom) -> Self {
        Self {
            id: ID(v.id.to_string()),
            name: v.name,
            building_id: v.building_id,
        }
    }
}
