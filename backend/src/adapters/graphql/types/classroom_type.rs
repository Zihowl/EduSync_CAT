use std::sync::Arc;

use async_graphql::{ComplexObject, Context, SimpleObject, ID};

use crate::adapters::graphql::types::building_type::BuildingType;
use crate::domain::models::classroom::Classroom;
use crate::domain::services::building_service::BuildingService;

#[derive(SimpleObject, Clone)]
#[graphql(complex)]
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

#[ComplexObject]
impl ClassroomType {
    async fn building(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<BuildingType>> {
        let Some(building_id) = self.building_id else {
            return Ok(None);
        };

        let svc = ctx.data::<Arc<BuildingService>>()?;
        let building = svc.find_one(building_id).await?;

        Ok(building.map(Into::into))
    }
}
