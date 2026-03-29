use async_graphql::{ID, SimpleObject};

use crate::domain::models::group::Group;

#[derive(SimpleObject, Clone)]
pub struct GroupType {
    pub id: ID,
    pub name: String,
    pub parent_id: Option<i32>,
}

impl From<Group> for GroupType {
    fn from(v: Group) -> Self {
        Self {
            id: ID(v.id.to_string()),
            name: v.name,
            parent_id: v.parent_id,
        }
    }
}
