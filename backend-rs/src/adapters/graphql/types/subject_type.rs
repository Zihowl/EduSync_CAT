use async_graphql::{ID, SimpleObject};

use crate::domain::models::subject::Subject;

#[derive(SimpleObject, Clone)]
pub struct SubjectType {
    pub id: ID,
    pub code: String,
    pub name: String,
}

impl From<Subject> for SubjectType {
    fn from(v: Subject) -> Self {
        Self {
            id: ID(v.id.to_string()),
            code: v.code,
            name: v.name,
        }
    }
}
