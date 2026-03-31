use async_graphql::{ID, SimpleObject};

use crate::domain::models::teacher::Teacher;

#[derive(SimpleObject, Clone)]
pub struct TeacherType {
    pub id: ID,
    pub employee_number: String,
    pub name: String,
    pub email: Option<String>,
}

impl From<Teacher> for TeacherType {
    fn from(v: Teacher) -> Self {
        Self {
            id: ID(v.id.to_string()),
            employee_number: v.employee_number,
            name: v.name,
            email: v.email,
        }
    }
}
