use async_graphql::{Error as GqlError, MergedObject, Schema};

use crate::domain::errors::DomainError;

use super::{
    mutations::{
        auth_mutation::AuthMutation, building_mutation::BuildingMutation,
        classroom_mutation::ClassroomMutation, config_mutation::ConfigMutation,
        group_mutation::GroupMutation, schedule_mutation::ScheduleMutation,
        subject_mutation::SubjectMutation, teacher_mutation::TeacherMutation,
        user_mutation::UserMutation,
    },
    queries::{
        audit_log_query::AuditLogQuery, building_query::BuildingQuery, classroom_query::ClassroomQuery,
        config_query::ConfigQuery, group_query::GroupQuery, schedule_query::ScheduleQuery,
        subject_query::SubjectQuery, teacher_query::TeacherQuery, user_query::UserQuery,
    },
    realtime::RealtimeSubscription,
};

#[derive(MergedObject, Default)]
pub struct MergedQuery(
    AuditLogQuery,
    UserQuery,
    ConfigQuery,
    TeacherQuery,
    SubjectQuery,
    BuildingQuery,
    ClassroomQuery,
    GroupQuery,
    ScheduleQuery,
);

#[derive(MergedObject, Default)]
pub struct MergedMutation(
    AuthMutation,
    UserMutation,
    ConfigMutation,
    TeacherMutation,
    SubjectMutation,
    BuildingMutation,
    ClassroomMutation,
    GroupMutation,
    ScheduleMutation,
);

pub type AppSchema = Schema<MergedQuery, MergedMutation, RealtimeSubscription>;

pub fn to_gql_error(err: DomainError) -> GqlError {
    GqlError::new(err.msg())
}

pub fn build_schema(
) -> async_graphql::SchemaBuilder<MergedQuery, MergedMutation, RealtimeSubscription> {
    Schema::build(
        MergedQuery::default(),
        MergedMutation::default(),
        RealtimeSubscription::default(),
    )
}
