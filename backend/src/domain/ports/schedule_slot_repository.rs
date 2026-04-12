use async_trait::async_trait;

use crate::domain::{
    errors::DomainError,
    models::schedule_slot::{ScheduleFilter, ScheduleSlot},
};

#[async_trait]
pub trait ScheduleSlotRepository: Send + Sync {
    async fn find_all(&self, filter: ScheduleFilter) -> Result<Vec<ScheduleSlot>, DomainError>;
    async fn find_by_id(&self, id: i32) -> Result<Option<ScheduleSlot>, DomainError>;
    async fn create(&self, slot: ScheduleSlot) -> Result<ScheduleSlot, DomainError>;
    async fn create_many(&self, slots: Vec<ScheduleSlot>) -> Result<Vec<ScheduleSlot>, DomainError>;
    async fn update(&self, slot: ScheduleSlot) -> Result<ScheduleSlot, DomainError>;
    async fn delete(&self, id: i32) -> Result<bool, DomainError>;
    async fn set_published(&self, ids: &[i32], is_published: bool) -> Result<i64, DomainError>;
    async fn find_conflict_for_teacher(
        &self,
        teacher_id: i32,
        day_of_week: i32,
        start_time: &str,
        end_time: &str,
        exclude_id: Option<i32>,
    ) -> Result<Option<ScheduleSlot>, DomainError>;
    async fn find_conflict_for_group(
        &self,
        group_id: i32,
        subgroup: Option<&str>,
        day_of_week: i32,
        start_time: &str,
        end_time: &str,
        exclude_id: Option<i32>,
    ) -> Result<Option<ScheduleSlot>, DomainError>;
    async fn find_conflict_for_classroom(
        &self,
        classroom_id: i32,
        day_of_week: i32,
        start_time: &str,
        end_time: &str,
        exclude_id: Option<i32>,
    ) -> Result<Option<ScheduleSlot>, DomainError>;
}
