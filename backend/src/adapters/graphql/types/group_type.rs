use std::sync::Arc;

use async_graphql::{ComplexObject, Context, ID, SimpleObject};

use crate::domain::models::group::Group;
use crate::domain::services::group_service::GroupService;

#[derive(SimpleObject, Clone)]
#[graphql(complex)]
pub struct GroupType {
    pub id: ID,
    pub name: String,
    pub parent_id: Option<i32>,
    pub grade: Option<i32>,
}

impl From<Group> for GroupType {
    fn from(v: Group) -> Self {
        Self {
            id: ID(v.id.to_string()),
            name: v.name,
            parent_id: v.parent_id,
            grade: v.grade,
        }
    }
}

#[ComplexObject]
impl GroupType {
    async fn parent(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<GroupType>> {
        let Some(parent_id) = self.parent_id else {
            return Ok(None);
        };

        let svc = ctx.data::<Arc<GroupService>>()?;
        let parent = svc.find_one(parent_id).await?;

        Ok(parent.map(Into::into))
    }

    async fn has_schedule_slots(&self, ctx: &Context<'_>) -> async_graphql::Result<bool> {
        let id = self
            .id
            .as_str()
            .parse::<i32>()
            .map_err(|_| async_graphql::Error::new("Identificador de grupo inválido"))?;
        let svc = ctx.data::<Arc<GroupService>>()?;

        Ok(svc.has_schedule_slots(id).await?)
    }
}
