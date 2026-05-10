pub mod adapters;
pub mod config;
pub mod domain;
pub mod infrastructure;

use std::sync::Arc;

use crate::adapters::graphql::{realtime::RealtimeBroadcaster, schema::AppSchema};
use crate::config::AppConfig;
use crate::domain::{
    ports::user_repository::UserRepository,
    services::{
        classroom_service::ClassroomService, excel_service::ExcelService,
        group_service::GroupService, schedule_service::ScheduleService,
        subject_service::SubjectService, teacher_service::TeacherService,
    },
};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub user_repo: Arc<dyn UserRepository>,
    pub schema: AppSchema,
    pub realtime: Arc<RealtimeBroadcaster>,
    pub teacher_service: Arc<TeacherService>,
    pub subject_service: Arc<SubjectService>,
    pub classroom_service: Arc<ClassroomService>,
    pub group_service: Arc<GroupService>,
    pub schedule_service: Arc<ScheduleService>,
    pub excel_service: Arc<ExcelService>,
}
