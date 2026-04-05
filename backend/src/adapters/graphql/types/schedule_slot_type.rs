use std::sync::Arc;

use async_graphql::{ComplexObject, Context, ID, SimpleObject};

use crate::adapters::graphql::types::{classroom_type::ClassroomType, group_type::GroupType, subject_type::SubjectType, teacher_type::TeacherType};
use crate::domain::services::{classroom_service::ClassroomService, group_service::GroupService, subject_service::SubjectService, teacher_service::TeacherService};

#[derive(SimpleObject, Clone)]
#[graphql(complex)]
pub struct ScheduleSlotType {
    pub id: ID,
    pub teacher_id: Option<i32>,
    pub subject_id: i32,
    pub classroom_id: i32,
    pub group_id: i32,
    pub day_of_week: i32,
    pub start_time: String,
    pub end_time: String,
    pub subgroup: Option<String>,
    pub is_published: bool,
    pub created_by_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<crate::domain::models::schedule_slot::ScheduleSlot> for ScheduleSlotType {
    fn from(v: crate::domain::models::schedule_slot::ScheduleSlot) -> Self {
        Self {
            id: ID(v.id.to_string()),
            teacher_id: v.teacher_id,
            subject_id: v.subject_id,
            classroom_id: v.classroom_id,
            group_id: v.group_id,
            day_of_week: v.day_of_week,
            start_time: v.start_time,
            end_time: v.end_time,
            subgroup: v.subgroup,
            is_published: v.is_published,
            created_by_id: v.created_by_id.map(|x| x.to_string()),
            created_at: v.created_at,
            updated_at: v.updated_at,
        }
    }
}

#[ComplexObject]
impl ScheduleSlotType {
    async fn teacher(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<TeacherType>> {
        let Some(teacher_id) = self.teacher_id else {
            return Ok(None);
        };

        let svc = ctx.data::<Arc<TeacherService>>()?;
        let teacher = svc.find_one(teacher_id).await?;

        Ok(teacher.map(Into::into))
    }

    async fn subject(&self, ctx: &Context<'_>) -> async_graphql::Result<SubjectType> {
        let svc = ctx.data::<Arc<SubjectService>>()?;
        let subject = svc
            .find_one(self.subject_id)
            .await?
            .ok_or_else(|| async_graphql::Error::new("Materia no encontrada"))?;

        Ok(SubjectType::from(subject))
    }

    async fn classroom(&self, ctx: &Context<'_>) -> async_graphql::Result<ClassroomType> {
        let svc = ctx.data::<Arc<ClassroomService>>()?;
        let classroom = svc
            .find_one(self.classroom_id)
            .await?
            .ok_or_else(|| async_graphql::Error::new("Salon no encontrado"))?;

        Ok(ClassroomType::from(classroom))
    }

    async fn group(&self, ctx: &Context<'_>) -> async_graphql::Result<GroupType> {
        let svc = ctx.data::<Arc<GroupService>>()?;
        let group = svc
            .find_one(self.group_id)
            .await?
            .ok_or_else(|| async_graphql::Error::new("Grupo no encontrado"))?;

        Ok(GroupType::from(group))
    }
}
