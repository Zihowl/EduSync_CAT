use async_graphql::{ID, SimpleObject};

use crate::domain::models::building::Building;

#[derive(SimpleObject, Clone)]
pub struct BuildingType {
    pub id: ID,
    pub name: String,
    pub description: Option<String>,
}

impl From<Building> for BuildingType {
    fn from(v: Building) -> Self {
        Self {
            id: ID(v.id.to_string()),
            name: v.name,
            description: v.description,
        }
    }
}
