use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_admin,
        graphql::{schema::to_gql_error, types::teacher_type::TeacherType},
    },
    domain::services::teacher_service::TeacherService,
};

#[derive(Default)]
pub struct TeacherQuery;

#[Object]
impl TeacherQuery {
    #[graphql(name = "GetTeachers")]
    async fn get_teachers(&self, ctx: &Context<'_>) -> async_graphql::Result<Vec<TeacherType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<TeacherService>>()?;
        svc.find_all()
            .await
            .map(|v| v.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    #[graphql(name = "GetTeacher")]
    async fn get_teacher(
        &self,
        ctx: &Context<'_>,
        id: i32,
    ) -> async_graphql::Result<Option<TeacherType>> {
        let _ = require_admin(ctx)?;
        let svc = ctx.data::<Arc<TeacherService>>()?;
        svc.find_one(id)
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}
