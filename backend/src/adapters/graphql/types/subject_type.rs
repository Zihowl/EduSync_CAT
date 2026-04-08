use async_graphql::{ID, SimpleObject};

use crate::domain::models::subject::Subject;

#[derive(SimpleObject, Clone)]
pub struct SubjectType {
    pub id: ID,
    pub code: String,
    pub name: String,
    pub grade: Option<i32>,
    pub division: Option<String>,
}

impl From<Subject> for SubjectType {
    fn from(v: Subject) -> Self {
        Self {
            id: ID(v.id.to_string()),
            code: v.code,
            name: v.name,
            grade: v.grade,
            division: v.division,
        }
    }
}
