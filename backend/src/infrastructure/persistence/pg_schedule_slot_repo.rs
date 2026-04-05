use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::schedule_slot::{ScheduleFilter, ScheduleSlot},
    ports::schedule_slot_repository::ScheduleSlotRepository,
};

#[derive(Clone)]
pub struct PgScheduleSlotRepository {
    pool: PgPool,
}

impl PgScheduleSlotRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[derive(FromRow)]
struct SlotRow {
    id: i32,
    teacher_id: Option<i32>,
    subject_id: i32,
    classroom_id: i32,
    group_id: i32,
    day_of_week: i32,
    start_time: String,
    end_time: String,
    subgroup: Option<String>,
    is_published: bool,
    created_by_id: Option<Uuid>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<SlotRow> for ScheduleSlot {
    fn from(v: SlotRow) -> Self {
        Self {
            id: v.id,
            teacher_id: v.teacher_id,
            subject_id: v.subject_id,
            classroom_id: v.classroom_id,
            group_id: v.group_id,
            day_of_week: v.day_of_week,
            start_time: v.start_time,
            end_time: v.end_time,
            subgroup: v.subgroup,
            is_published: v.is_published,
            created_by_id: v.created_by_id,
            created_at: v.created_at,
            updated_at: v.updated_at,
        }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("DB schedule_slots error: {e}"))
}

fn select_base() -> &'static str {
    "SELECT id, teacher_id, subject_id, classroom_id, group_id, day_of_week,
            start_time::text AS start_time, end_time::text AS end_time,
            subgroup, is_published, created_by_id, created_at, updated_at
     FROM schedule_slots"
}

#[async_trait]
impl ScheduleSlotRepository for PgScheduleSlotRepository {
    async fn find_all(&self, filter: ScheduleFilter) -> Result<Vec<ScheduleSlot>, DomainError> {
        let page = filter.page.unwrap_or(1).max(1);
        let limit = filter.limit.unwrap_or(50).max(1);
        let offset = (page - 1) * limit;
        let rows = sqlx::query_as::<_, SlotRow>(
            "SELECT id, teacher_id, subject_id, classroom_id, group_id, day_of_week,
                    start_time::text AS start_time, end_time::text AS end_time,
                    subgroup, is_published, created_by_id, created_at, updated_at
             FROM schedule_slots
             WHERE ($1::int IS NULL OR teacher_id = $1)
               AND ($2::int IS NULL OR classroom_id = $2)
               AND ($3::int IS NULL OR group_id = $3)
               AND ($4::int IS NULL OR day_of_week = $4)
               AND ($5::bool IS NULL OR is_published = $5)
             ORDER BY day_of_week ASC, start_time ASC
             LIMIT $6 OFFSET $7",
        )
        .bind(filter.teacher_id)
        .bind(filter.classroom_id)
        .bind(filter.group_id)
        .bind(filter.day_of_week)
        .bind(filter.is_published)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(Into::into).collect())
    }

    async fn find_by_id(&self, id: i32) -> Result<Option<ScheduleSlot>, DomainError> {
        let row = sqlx::query_as::<_, SlotRow>(&format!("{} WHERE id = $1", select_base()))
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn create(&self, slot: ScheduleSlot) -> Result<ScheduleSlot, DomainError> {
        let row = sqlx::query_as::<_, SlotRow>(
            "INSERT INTO schedule_slots (teacher_id, subject_id, classroom_id, group_id, day_of_week, start_time, end_time, subgroup, is_published, created_by_id)
             VALUES ($1, $2, $3, $4, $5, $6::time, $7::time, $8, $9, $10)
             RETURNING id, teacher_id, subject_id, classroom_id, group_id, day_of_week,
                       start_time::text AS start_time, end_time::text AS end_time,
                       subgroup, is_published, created_by_id, created_at, updated_at",
        )
        .bind(slot.teacher_id)
        .bind(slot.subject_id)
        .bind(slot.classroom_id)
        .bind(slot.group_id)
        .bind(slot.day_of_week)
        .bind(&slot.start_time)
        .bind(&slot.end_time)
        .bind(&slot.subgroup)
        .bind(slot.is_published)
        .bind(slot.created_by_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn update(&self, slot: ScheduleSlot) -> Result<ScheduleSlot, DomainError> {
        let row = sqlx::query_as::<_, SlotRow>(
            "UPDATE schedule_slots
             SET teacher_id = $1, subject_id = $2, classroom_id = $3, group_id = $4,
                 day_of_week = $5, start_time = $6::time, end_time = $7::time,
                 subgroup = $8, is_published = $9, updated_at = NOW()
             WHERE id = $10
             RETURNING id, teacher_id, subject_id, classroom_id, group_id, day_of_week,
                       start_time::text AS start_time, end_time::text AS end_time,
                       subgroup, is_published, created_by_id, created_at, updated_at",
        )
        .bind(slot.teacher_id)
        .bind(slot.subject_id)
        .bind(slot.classroom_id)
        .bind(slot.group_id)
        .bind(slot.day_of_week)
        .bind(&slot.start_time)
        .bind(&slot.end_time)
        .bind(&slot.subgroup)
        .bind(slot.is_published)
        .bind(slot.id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        let result = sqlx::query("DELETE FROM schedule_slots WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() > 0)
    }

    async fn set_published(&self, ids: &[i32], is_published: bool) -> Result<i64, DomainError> {
        let result = sqlx::query("UPDATE schedule_slots SET is_published = $1 WHERE id = ANY($2)")
            .bind(is_published)
            .bind(ids)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(result.rows_affected() as i64)
    }

    async fn find_conflict_for_teacher(
        &self,
        teacher_id: i32,
        day_of_week: i32,
        start_time: &str,
        end_time: &str,
        exclude_id: Option<i32>,
    ) -> Result<Option<ScheduleSlot>, DomainError> {
        let row = sqlx::query_as::<_, SlotRow>(
            "SELECT id, teacher_id, subject_id, classroom_id, group_id, day_of_week,
                    start_time::text AS start_time, end_time::text AS end_time,
                    subgroup, is_published, created_by_id, created_at, updated_at
             FROM schedule_slots
             WHERE day_of_week = $1
               AND teacher_id = $2
               AND start_time < $3::time
               AND end_time > $4::time
               AND ($5::int IS NULL OR id != $5)
             LIMIT 1",
        )
        .bind(day_of_week)
        .bind(teacher_id)
        .bind(end_time)
        .bind(start_time)
        .bind(exclude_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.map(Into::into))
    }

    async fn find_conflict_for_classroom(
        &self,
        classroom_id: i32,
        day_of_week: i32,
        start_time: &str,
        end_time: &str,
        exclude_id: Option<i32>,
    ) -> Result<Option<ScheduleSlot>, DomainError> {
        let row = sqlx::query_as::<_, SlotRow>(
            "SELECT id, teacher_id, subject_id, classroom_id, group_id, day_of_week,
                    start_time::text AS start_time, end_time::text AS end_time,
                    subgroup, is_published, created_by_id, created_at, updated_at
             FROM schedule_slots
             WHERE day_of_week = $1
               AND classroom_id = $2
               AND start_time < $3::time
               AND end_time > $4::time
               AND ($5::int IS NULL OR id != $5)
             LIMIT 1",
        )
        .bind(day_of_week)
        .bind(classroom_id)
        .bind(end_time)
        .bind(start_time)
        .bind(exclude_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(row.map(Into::into))
    }
}
