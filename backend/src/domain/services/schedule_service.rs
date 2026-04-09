use std::sync::Arc;

use chrono::Utc;

use crate::domain::{
    errors::DomainError,
    models::schedule_slot::{ScheduleFilter, ScheduleSlot},
    ports::{
        classroom_repository::ClassroomRepository,
        group_repository::GroupRepository,
        schedule_slot_repository::ScheduleSlotRepository,
        subject_repository::SubjectRepository,
        teacher_repository::TeacherRepository,
    },
};

#[derive(Clone)]
pub struct ScheduleService {
    repo: Arc<dyn ScheduleSlotRepository>,
    teacher_repo: Arc<dyn TeacherRepository>,
    subject_repo: Arc<dyn SubjectRepository>,
    classroom_repo: Arc<dyn ClassroomRepository>,
    group_repo: Arc<dyn GroupRepository>,
}

#[derive(Clone)]
pub struct CreateScheduleSlot {
    pub teacher_id: Option<i32>,
    pub subject_id: i32,
    pub classroom_id: i32,
    pub group_id: i32,
    pub day_of_week: i32,
    pub start_time: String,
    pub end_time: String,
    pub subgroup: Option<String>,
    pub is_published: bool,
    pub created_by_id: Option<uuid::Uuid>,
}

#[derive(Clone)]
pub struct UpdateScheduleSlot {
    pub id: i32,
    pub teacher_id: Option<Option<i32>>,
    pub subject_id: Option<i32>,
    pub classroom_id: Option<i32>,
    pub group_id: Option<i32>,
    pub day_of_week: Option<i32>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub subgroup: Option<Option<String>>,
    pub is_published: Option<bool>,
}

impl ScheduleService {
    pub fn new(
        repo: Arc<dyn ScheduleSlotRepository>,
        teacher_repo: Arc<dyn TeacherRepository>,
        subject_repo: Arc<dyn SubjectRepository>,
        classroom_repo: Arc<dyn ClassroomRepository>,
        group_repo: Arc<dyn GroupRepository>,
    ) -> Self {
        Self {
            repo,
            teacher_repo,
            subject_repo,
            classroom_repo,
            group_repo,
        }
    }

    pub async fn find_all(&self, filter: ScheduleFilter) -> Result<Vec<ScheduleSlot>, DomainError> {
        self.repo.find_all(filter).await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<ScheduleSlot>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn create(&self, input: CreateScheduleSlot) -> Result<ScheduleSlot, DomainError> {
        self.validate_times(&input.start_time, &input.end_time)?;
        self.ensure_dependencies(input.teacher_id, input.subject_id, input.classroom_id, input.group_id)
            .await?;
        self.ensure_collisions(
            input.teacher_id,
            input.classroom_id,
            input.day_of_week,
            &input.start_time,
            &input.end_time,
            None,
        )
        .await?;

        let now = Utc::now();
        self.repo
            .create(ScheduleSlot {
                id: 0,
                teacher_id: input.teacher_id,
                subject_id: input.subject_id,
                classroom_id: input.classroom_id,
                group_id: input.group_id,
                day_of_week: input.day_of_week,
                start_time: input.start_time,
                end_time: input.end_time,
                subgroup: input.subgroup,
                is_published: input.is_published,
                created_by_id: input.created_by_id,
                created_at: now,
                updated_at: now,
            })
            .await
    }

    pub async fn update(&self, input: UpdateScheduleSlot) -> Result<ScheduleSlot, DomainError> {
        let current = self
            .repo
            .find_by_id(input.id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Horario no encontrado".to_string()))?;

        let merged = ScheduleSlot {
            id: current.id,
            teacher_id: input.teacher_id.unwrap_or(current.teacher_id),
            subject_id: input.subject_id.unwrap_or(current.subject_id),
            classroom_id: input.classroom_id.unwrap_or(current.classroom_id),
            group_id: input.group_id.unwrap_or(current.group_id),
            day_of_week: input.day_of_week.unwrap_or(current.day_of_week),
            start_time: input.start_time.unwrap_or(current.start_time),
            end_time: input.end_time.unwrap_or(current.end_time),
            subgroup: input.subgroup.unwrap_or(current.subgroup),
            is_published: input.is_published.unwrap_or(current.is_published),
            created_by_id: current.created_by_id,
            created_at: current.created_at,
            updated_at: Utc::now(),
        };

        self.validate_times(&merged.start_time, &merged.end_time)?;
        self.ensure_dependencies(
            merged.teacher_id,
            merged.subject_id,
            merged.classroom_id,
            merged.group_id,
        )
        .await?;
        self.ensure_collisions(
            merged.teacher_id,
            merged.classroom_id,
            merged.day_of_week,
            &merged.start_time,
            &merged.end_time,
            Some(merged.id),
        )
        .await?;

        self.repo.update(merged).await
    }

    pub async fn remove(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }

    pub async fn set_published(&self, ids: &[i32], is_published: bool) -> Result<i64, DomainError> {
        self.repo.set_published(ids, is_published).await
    }

    fn validate_times(&self, start: &str, end: &str) -> Result<(), DomainError> {
        let to_min = |v: &str| -> Result<i32, DomainError> {
            let p: Vec<&str> = v.split(':').collect();
            if p.len() < 2 {
                return Err(DomainError::BadRequest("Formato de hora inválido".to_string()));
            }
            let h = p[0]
                .parse::<i32>()
                .map_err(|_| DomainError::BadRequest("Hora inválida".to_string()))?;
            let m = p[1]
                .parse::<i32>()
                .map_err(|_| DomainError::BadRequest("Hora inválida".to_string()))?;
            Ok(h * 60 + m)
        };

        if to_min(start)? >= to_min(end)? {
            return Err(DomainError::BadRequest(
                "La hora de inicio debe ser menor que la hora de fin".to_string(),
            ));
        }

        Ok(())
    }

    async fn ensure_dependencies(
        &self,
        teacher_id: Option<i32>,
        subject_id: i32,
        classroom_id: i32,
        group_id: i32,
    ) -> Result<(), DomainError> {
        if let Some(teacher_id) = teacher_id {
            if self.teacher_repo.find_by_id(teacher_id).await?.is_none() {
                return Err(DomainError::NotFound("Profesor no encontrado".to_string()));
            }
        }
        if self.subject_repo.find_by_id(subject_id).await?.is_none() {
            return Err(DomainError::NotFound("Materia no encontrada".to_string()));
        }
        if self.classroom_repo.find_by_id(classroom_id).await?.is_none() {
            return Err(DomainError::NotFound("Salón no encontrado".to_string()));
        }
        if self.group_repo.find_by_id(group_id).await?.is_none() {
            return Err(DomainError::NotFound("Grupo no encontrado".to_string()));
        }
        Ok(())
    }

    async fn ensure_collisions(
        &self,
        teacher_id: Option<i32>,
        classroom_id: i32,
        day_of_week: i32,
        start_time: &str,
        end_time: &str,
        exclude_id: Option<i32>,
    ) -> Result<(), DomainError> {
        if let Some(teacher_id) = teacher_id {
            if let Some(conflict) = self
                .repo
                .find_conflict_for_teacher(
                    teacher_id,
                    day_of_week,
                    start_time,
                    end_time,
                    exclude_id,
                )
                .await?
            {
                return Err(DomainError::Conflict(format!(
                    "El profesor ya tiene horario de {} a {}",
                    conflict.start_time, conflict.end_time
                )));
            }
        }

        if let Some(conflict) = self
            .repo
            .find_conflict_for_classroom(
                classroom_id,
                day_of_week,
                start_time,
                end_time,
                exclude_id,
            )
            .await?
        {
            return Err(DomainError::Conflict(format!(
                "El salón ya está ocupado de {} a {}",
                conflict.start_time, conflict.end_time
            )));
        }

        Ok(())
    }
}
