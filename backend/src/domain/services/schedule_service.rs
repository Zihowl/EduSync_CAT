use std::sync::Arc;

use chrono::Utc;

use crate::domain::{
    errors::DomainError,
    models::schedule_slot::{ScheduleFilter, ScheduleSlot},
    ports::{
        classroom_repository::ClassroomRepository, group_repository::GroupRepository,
        schedule_slot_repository::ScheduleSlotRepository, subject_repository::SubjectRepository,
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
    pub overwrite: bool,
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
        self.ensure_dependencies(
            input.teacher_id,
            input.subject_id,
            input.classroom_id,
            input.group_id,
        )
        .await?;
        let subgroup = Self::normalize_subgroup_key(input.subgroup.as_deref());
        self.handle_collisions(
            input.teacher_id,
            input.classroom_id,
            input.group_id,
            subgroup.as_deref(),
            input.day_of_week,
            &input.start_time,
            &input.end_time,
            None,
            input.overwrite,
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

    pub async fn create_many(
        &self,
        inputs: Vec<CreateScheduleSlot>,
    ) -> Result<Vec<ScheduleSlot>, DomainError> {
        if inputs.is_empty() {
            return Err(DomainError::BadRequest(
                "Debes agregar al menos un bloque".to_string(),
            ));
        }

        for input in &inputs {
            self.validate_times(&input.start_time, &input.end_time)?;
            self.ensure_dependencies(
                input.teacher_id,
                input.subject_id,
                input.classroom_id,
                input.group_id,
            )
            .await?;
            let subgroup = Self::normalize_subgroup_key(input.subgroup.as_deref());
            self.handle_collisions(
                input.teacher_id,
                input.classroom_id,
                input.group_id,
                subgroup.as_deref(),
                input.day_of_week,
                &input.start_time,
                &input.end_time,
                None,
                input.overwrite,
            )
            .await?;
        }

        for (index, current) in inputs.iter().enumerate() {
            for previous in inputs.iter().take(index) {
                self.ensure_batch_compatibility(previous, current)?;
            }
        }

        let now = Utc::now();
        let slots = inputs
            .into_iter()
            .map(|input| ScheduleSlot {
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
                created_at: now.clone(),
                updated_at: now.clone(),
            })
            .collect();

        self.repo.create_many(slots).await
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
        let subgroup = Self::normalize_subgroup_key(merged.subgroup.as_deref());
        self.handle_collisions(
            merged.teacher_id,
            merged.classroom_id,
            merged.group_id,
            subgroup.as_deref(),
            merged.day_of_week,
            &merged.start_time,
            &merged.end_time,
            Some(merged.id),
            false,
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

    fn time_to_minutes(value: &str) -> Result<i32, DomainError> {
        let p: Vec<&str> = value.split(':').collect();
        if p.len() < 2 {
            return Err(DomainError::BadRequest(
                "Formato de hora inválido".to_string(),
            ));
        }
        let h = p[0]
            .parse::<i32>()
            .map_err(|_| DomainError::BadRequest("Hora inválida".to_string()))?;
        let m = p[1]
            .parse::<i32>()
            .map_err(|_| DomainError::BadRequest("Hora inválida".to_string()))?;
        Ok(h * 60 + m)
    }

    fn validate_times(&self, start: &str, end: &str) -> Result<(), DomainError> {
        if Self::time_to_minutes(start)? >= Self::time_to_minutes(end)? {
            return Err(DomainError::BadRequest(
                "La hora de inicio debe ser menor que la hora de fin".to_string(),
            ));
        }

        Ok(())
    }

    fn intervals_overlap(
        start_a: &str,
        end_a: &str,
        start_b: &str,
        end_b: &str,
    ) -> Result<bool, DomainError> {
        Ok(Self::time_to_minutes(start_a)? < Self::time_to_minutes(end_b)?
            && Self::time_to_minutes(end_a)? > Self::time_to_minutes(start_b)?)
    }

    fn normalize_subgroup_key(value: Option<&str>) -> Option<String> {
        value
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
    }

    fn normalize_time_label(value: &str) -> String {
        let mut parts = value.split(':');
        let hour = parts.next().and_then(|part| part.parse::<i32>().ok());
        let minute = parts.next().and_then(|part| part.parse::<i32>().ok());
        let second = parts
            .next()
            .and_then(|part| part.parse::<i32>().ok())
            .unwrap_or(0);

        match (hour, minute) {
            (Some(hour), Some(minute)) => format!("{:02}:{:02}:{:02}", hour, minute, second),
            _ => value.to_string(),
        }
    }

    fn same_group_and_any_related_subgroup(
        left_group_id: i32,
        left_subgroup: Option<&str>,
        right_group_id: i32,
        right_subgroup: Option<&str>,
    ) -> bool {
        if left_group_id != right_group_id {
            return false;
        }

        let left_subgroup = Self::normalize_subgroup_key(left_subgroup);
        let right_subgroup = Self::normalize_subgroup_key(right_subgroup);

        left_subgroup.is_none()
            || right_subgroup.is_none()
            || left_subgroup == right_subgroup
    }

    fn ensure_batch_compatibility(
        &self,
        left: &CreateScheduleSlot,
        right: &CreateScheduleSlot,
    ) -> Result<(), DomainError> {
        if left.day_of_week != right.day_of_week {
            return Ok(());
        }

        if Self::same_group_and_any_related_subgroup(
            left.group_id,
            left.subgroup.as_deref(),
            right.group_id,
            right.subgroup.as_deref(),
        )
        && Self::intervals_overlap(
            &left.start_time,
            &left.end_time,
            &right.start_time,
            &right.end_time,
        )?
        {
            return Err(DomainError::Conflict(
                "Los bloques del mismo grupo y sus subgrupos no pueden traslaparse".to_string(),
            ));
        }

        let teacher_conflict = left.teacher_id.is_some() && left.teacher_id == right.teacher_id;
        let classroom_conflict = left.classroom_id == right.classroom_id;

        if !(teacher_conflict || classroom_conflict) {
            return Ok(());
        }

        if Self::intervals_overlap(
            &left.start_time,
            &left.end_time,
            &right.start_time,
            &right.end_time,
        )? {
            return Err(DomainError::Conflict(
                "Los bloques del mismo envío no pueden traslaparse".to_string(),
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
        if self
            .classroom_repo
            .find_by_id(classroom_id)
            .await?
            .is_none()
        {
            return Err(DomainError::NotFound("Salón no encontrado".to_string()));
        }
        if self.group_repo.find_by_id(group_id).await?.is_none() {
            return Err(DomainError::NotFound("Grupo no encontrado".to_string()));
        }
        Ok(())
    }

    async fn format_group_conflict_message(
        &self,
        group_id: i32,
        conflict_subgroup: Option<&str>,
        start_time: &str,
        end_time: &str,
    ) -> Result<String, DomainError> {
        let group_name = self
            .group_repo
            .find_by_id(group_id)
            .await?
            .map(|group| group.name)
            .unwrap_or_else(|| format!("grupo {}", group_id));

        let conflict_target = match Self::normalize_subgroup_key(conflict_subgroup) {
            Some(subgroup) => format!("El subgrupo {} del grupo {}", subgroup, group_name),
            None => format!("El tronco común del grupo {}", group_name),
        };

        Ok(format!(
            "{} ya tiene horario de {} a {}",
            conflict_target, start_time, end_time
        ))
    }

    pub async fn handle_collisions(
        &self,
        teacher_id: Option<i32>,
        classroom_id: i32,
        group_id: i32,
        subgroup: Option<&str>,
        day_of_week: i32,
        start_time: &str,
        end_time: &str,
        exclude_id: Option<i32>,
        overwrite: bool,
    ) -> Result<(), DomainError> {
        let normalized_subgroup = Self::normalize_subgroup_key(subgroup);

        while let Some(conflict) = self
            .repo
            .find_conflict_for_group(
                group_id,
                normalized_subgroup.as_deref(),
                day_of_week,
                start_time,
                end_time,
                exclude_id,
            )
            .await?
        {
            if overwrite {
                self.repo.delete(conflict.id).await?;
            } else {
                    return Err(DomainError::Conflict(
                        self.format_group_conflict_message(
                            group_id,
                            conflict.subgroup.as_deref(),
                            &Self::normalize_time_label(&conflict.start_time),
                            &Self::normalize_time_label(&conflict.end_time),
                        )
                        .await?,
                    ));
            }
        }

        if let Some(teacher_id) = teacher_id {
            while let Some(conflict) = self
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
                if overwrite {
                    self.repo.delete(conflict.id).await?;
                } else {
                    return Err(DomainError::Conflict(format!(
                        "El profesor ya tiene horario de {} a {}",
                        Self::normalize_time_label(&conflict.start_time),
                        Self::normalize_time_label(&conflict.end_time)
                    )));
                }
            }
        }

        while let Some(conflict) = self
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
            if overwrite {
                self.repo.delete(conflict.id).await?;
            } else {
                return Err(DomainError::Conflict(format!(
                    "El salón ya está ocupado de {} a {}",
                    Self::normalize_time_label(&conflict.start_time),
                    Self::normalize_time_label(&conflict.end_time)
                )));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{CreateScheduleSlot, ScheduleService};
    use async_trait::async_trait;
    use chrono::Utc;
    use std::sync::Arc;

    use crate::domain::{
        errors::DomainError,
        models::{
            classroom::Classroom,
            group::Group,
            schedule_slot::{ScheduleFilter, ScheduleSlot},
            subject::Subject,
            teacher::Teacher,
        },
        ports::{
            classroom_repository::ClassroomRepository,
            group_repository::GroupRepository,
            schedule_slot_repository::ScheduleSlotRepository,
            subject_repository::SubjectRepository,
            teacher_repository::TeacherRepository,
        },
    };

    struct MockTeacherRepository;

    #[async_trait]
    impl TeacherRepository for MockTeacherRepository {
        async fn find_all(&self) -> Result<Vec<Teacher>, DomainError> {
            Ok(vec![])
        }

        async fn find_by_id(&self, id: i32) -> Result<Option<Teacher>, DomainError> {
            Ok((id == 1).then_some(Teacher {
                id: 1,
                employee_number: "T-1".to_string(),
                name: "Docente".to_string(),
                email: None,
            }))
        }

        async fn find_by_employee_number(
            &self,
            _employee_number: &str,
        ) -> Result<Option<Teacher>, DomainError> {
            Ok(None)
        }

        async fn find_by_email(&self, _email: &str) -> Result<Option<Teacher>, DomainError> {
            Ok(None)
        }

        async fn create(
            &self,
            _employee_number: &str,
            _name: &str,
            _email: Option<&str>,
        ) -> Result<Teacher, DomainError> {
            Ok(Teacher {
                id: 1,
                employee_number: "T-1".to_string(),
                name: "Docente".to_string(),
                email: None,
            })
        }

        async fn update(
            &self,
            id: i32,
            _employee_number: Option<&str>,
            _name: Option<&str>,
            _email: Option<Option<&str>>,
        ) -> Result<Teacher, DomainError> {
            Ok(Teacher {
                id,
                employee_number: "T-1".to_string(),
                name: "Docente".to_string(),
                email: None,
            })
        }

        async fn delete(&self, _id: i32) -> Result<bool, DomainError> {
            Ok(true)
        }
    }

    struct MockSubjectRepository;

    #[async_trait]
    impl SubjectRepository for MockSubjectRepository {
        async fn find_all(&self) -> Result<Vec<Subject>, DomainError> {
            Ok(vec![])
        }

        async fn find_by_id(&self, id: i32) -> Result<Option<Subject>, DomainError> {
            Ok((id == 1).then_some(Subject {
                id: 1,
                code: "MAT".to_string(),
                name: "Matemáticas".to_string(),
                grade: None,
                division: None,
            }))
        }

        async fn find_by_code(&self, _code: &str) -> Result<Option<Subject>, DomainError> {
            Ok(None)
        }

        async fn create(
            &self,
            _code: &str,
            _name: &str,
            _grade: Option<i32>,
            _division: Option<&str>,
        ) -> Result<Subject, DomainError> {
            Ok(Subject {
                id: 1,
                code: "MAT".to_string(),
                name: "Matemáticas".to_string(),
                grade: None,
                division: None,
            })
        }

        async fn update(
            &self,
            id: i32,
            _code: Option<&str>,
            _name: Option<&str>,
            grade: Option<i32>,
            division: Option<&str>,
        ) -> Result<Subject, DomainError> {
            Ok(Subject {
                id,
                code: "MAT".to_string(),
                name: "Matemáticas".to_string(),
                grade,
                division: division.map(|value| value.to_string()),
            })
        }

        async fn delete(&self, _id: i32) -> Result<bool, DomainError> {
            Ok(true)
        }
    }

    struct MockClassroomRepository;

    #[async_trait]
    impl ClassroomRepository for MockClassroomRepository {
        async fn find_all(&self) -> Result<Vec<Classroom>, DomainError> {
            Ok(vec![])
        }

        async fn find_by_id(&self, id: i32) -> Result<Option<Classroom>, DomainError> {
            Ok(match id {
                1 => Some(Classroom {
                    id: 1,
                    name: "A1".to_string(),
                    building_id: None,
                }),
                2 => Some(Classroom {
                    id: 2,
                    name: "A2".to_string(),
                    building_id: None,
                }),
                _ => None,
            })
        }

        async fn find_by_name(&self, _name: &str) -> Result<Option<Classroom>, DomainError> {
            Ok(None)
        }

        async fn find_by_name_and_building(
            &self,
            _name: &str,
            _building_id: i32,
        ) -> Result<Option<Classroom>, DomainError> {
            Ok(None)
        }

        async fn create(
            &self,
            _name: &str,
            _building_id: Option<i32>,
        ) -> Result<Classroom, DomainError> {
            Ok(Classroom {
                id: 1,
                name: "A1".to_string(),
                building_id: None,
            })
        }

        async fn update(
            &self,
            id: i32,
            _name: Option<&str>,
            building_id: Option<Option<i32>>,
        ) -> Result<Classroom, DomainError> {
            Ok(Classroom {
                id,
                name: "A1".to_string(),
                building_id: building_id.flatten(),
            })
        }

        async fn delete(&self, _id: i32) -> Result<bool, DomainError> {
            Ok(true)
        }
    }

    struct MockGroupRepository;

    #[async_trait]
    impl GroupRepository for MockGroupRepository {
        async fn find_all(&self) -> Result<Vec<Group>, DomainError> {
            Ok(vec![])
        }

        async fn find_by_id(&self, id: i32) -> Result<Option<Group>, DomainError> {
            Ok(match id {
                1 => Some(Group {
                    id: 1,
                    name: "1A".to_string(),
                    parent_id: None,
                    grade: None,
                }),
                2 => Some(Group {
                    id: 2,
                    name: "2A".to_string(),
                    parent_id: None,
                    grade: None,
                }),
                _ => None,
            })
        }

        async fn find_by_name_and_parent(
            &self,
            _name: &str,
            _parent_id: Option<i32>,
        ) -> Result<Option<Group>, DomainError> {
            Ok(None)
        }

        async fn create(
            &self,
            _name: &str,
            _parent_id: Option<i32>,
            _grade: Option<i32>,
        ) -> Result<Group, DomainError> {
            Ok(Group {
                id: 1,
                name: "1A".to_string(),
                parent_id: None,
                grade: None,
            })
        }

        async fn update(
            &self,
            id: i32,
            _name: Option<&str>,
            parent_id: Option<Option<i32>>,
            grade: Option<Option<i32>>,
        ) -> Result<Group, DomainError> {
            Ok(Group {
                id,
                name: "1A".to_string(),
                parent_id: parent_id.flatten(),
                grade: grade.flatten(),
            })
        }

        async fn delete(&self, _id: i32) -> Result<bool, DomainError> {
            Ok(true)
        }
    }

    #[derive(Clone)]
    struct MockScheduleSlotRepository {
        group_conflicts: Vec<ScheduleSlot>,
        classroom_conflicts: Vec<ScheduleSlot>,
    }

    impl MockScheduleSlotRepository {
        fn new(group_conflicts: Vec<ScheduleSlot>, classroom_conflicts: Vec<ScheduleSlot>) -> Self {
            Self {
                group_conflicts,
                classroom_conflicts,
            }
        }

        fn normalize_subgroup(value: Option<&str>) -> Option<String> {
            value
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
        }

        fn matches_group_conflict(
            conflict: &ScheduleSlot,
            group_id: i32,
            subgroup: Option<&str>,
            day_of_week: i32,
            start_time: &str,
            end_time: &str,
            exclude_id: Option<i32>,
        ) -> bool {
            if conflict.group_id != group_id
                || conflict.day_of_week != day_of_week
                || exclude_id == Some(conflict.id)
            {
                return false;
            }

            let request_subgroup = Self::normalize_subgroup(subgroup);
            let conflict_subgroup = Self::normalize_subgroup(conflict.subgroup.as_deref());

            if request_subgroup.is_none()
                || conflict_subgroup.is_none()
                || request_subgroup == conflict_subgroup
            {
                ScheduleService::intervals_overlap(
                    &conflict.start_time,
                    &conflict.end_time,
                    start_time,
                    end_time,
                )
                .unwrap_or(false)
            } else {
                false
            }
        }

        fn matches_classroom_conflict(
            conflict: &ScheduleSlot,
            classroom_id: i32,
            day_of_week: i32,
            start_time: &str,
            end_time: &str,
            exclude_id: Option<i32>,
        ) -> bool {
            conflict.classroom_id == classroom_id
                && conflict.day_of_week == day_of_week
                && exclude_id != Some(conflict.id)
                && ScheduleService::intervals_overlap(
                    &conflict.start_time,
                    &conflict.end_time,
                    start_time,
                    end_time,
                )
                .unwrap_or(false)
        }
    }

    #[async_trait]
    impl ScheduleSlotRepository for MockScheduleSlotRepository {
        async fn find_all(&self, _filter: ScheduleFilter) -> Result<Vec<ScheduleSlot>, DomainError> {
            Ok(vec![])
        }

        async fn find_by_id(&self, _id: i32) -> Result<Option<ScheduleSlot>, DomainError> {
            Ok(None)
        }

        async fn create(&self, slot: ScheduleSlot) -> Result<ScheduleSlot, DomainError> {
            Ok(slot)
        }

        async fn create_many(
            &self,
            slots: Vec<ScheduleSlot>,
        ) -> Result<Vec<ScheduleSlot>, DomainError> {
            Ok(slots)
        }

        async fn update(&self, slot: ScheduleSlot) -> Result<ScheduleSlot, DomainError> {
            Ok(slot)
        }

        async fn delete(&self, _id: i32) -> Result<bool, DomainError> {
            Ok(true)
        }

        async fn set_published(&self, ids: &[i32], _is_published: bool) -> Result<i64, DomainError> {
            Ok(ids.len() as i64)
        }

        async fn find_conflict_for_teacher(
            &self,
            _teacher_id: i32,
            _day_of_week: i32,
            _start_time: &str,
            _end_time: &str,
            _exclude_id: Option<i32>,
        ) -> Result<Option<ScheduleSlot>, DomainError> {
            Ok(None)
        }

        async fn find_conflict_for_group(
            &self,
            group_id: i32,
            subgroup: Option<&str>,
            day_of_week: i32,
            start_time: &str,
            end_time: &str,
            exclude_id: Option<i32>,
        ) -> Result<Option<ScheduleSlot>, DomainError> {
            Ok(self
                .group_conflicts
                .iter()
                .find(|conflict| {
                    Self::matches_group_conflict(
                        conflict,
                        group_id,
                        subgroup,
                        day_of_week,
                        start_time,
                        end_time,
                        exclude_id,
                    )
                })
                .cloned())
        }

        async fn find_conflict_for_classroom(
            &self,
            classroom_id: i32,
            day_of_week: i32,
            start_time: &str,
            end_time: &str,
            exclude_id: Option<i32>,
        ) -> Result<Option<ScheduleSlot>, DomainError> {
            Ok(self
                .classroom_conflicts
                .iter()
                .find(|conflict| {
                    Self::matches_classroom_conflict(
                        conflict,
                        classroom_id,
                        day_of_week,
                        start_time,
                        end_time,
                        exclude_id,
                    )
                })
                .cloned())
        }
    }

    fn build_service(
        group_conflicts: Vec<ScheduleSlot>,
        classroom_conflicts: Vec<ScheduleSlot>,
    ) -> ScheduleService {
        ScheduleService::new(
            Arc::new(MockScheduleSlotRepository::new(group_conflicts, classroom_conflicts)),
            Arc::new(MockTeacherRepository),
            Arc::new(MockSubjectRepository),
            Arc::new(MockClassroomRepository),
            Arc::new(MockGroupRepository),
        )
    }

    fn sample_slot(
        id: i32,
        group_id: i32,
        subgroup: Option<&str>,
        day_of_week: i32,
        start_time: &str,
        end_time: &str,
    ) -> ScheduleSlot {
        let now = Utc::now();

        ScheduleSlot {
            id,
            teacher_id: Some(1),
            subject_id: 1,
            classroom_id: 1,
            group_id,
            day_of_week,
            start_time: start_time.to_string(),
            end_time: end_time.to_string(),
            subgroup: subgroup.map(|value| value.to_string()),
            is_published: false,
            created_by_id: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn sample_create_input(subgroup: Option<&str>, start_time: &str, end_time: &str) -> CreateScheduleSlot {
        sample_create_input_with(Some(1), 1, 1, subgroup, start_time, end_time)
    }

    fn sample_create_input_with(
        teacher_id: Option<i32>,
        classroom_id: i32,
        group_id: i32,
        subgroup: Option<&str>,
        start_time: &str,
        end_time: &str,
    ) -> CreateScheduleSlot {
        CreateScheduleSlot {
            teacher_id,
            subject_id: 1,
            classroom_id,
            group_id,
            day_of_week: 1,
            start_time: start_time.to_string(),
            end_time: end_time.to_string(),
            subgroup: subgroup.map(|value| value.to_string()),
            is_published: false,
            created_by_id: None,
            overwrite: false,
        }
    }

    #[tokio::test]
    async fn create_rejects_trunk_common_when_subgroup_is_busy() {
        let service = build_service(vec![sample_slot(10, 1, Some("A"), 1, "08:30", "09:30")], vec![]);

        let result = service
            .create(sample_create_input(None, "08:00", "09:00"))
            .await;

        assert!(matches!(result, Err(DomainError::Conflict(message)) if message.contains("El subgrupo A del grupo 1A ya tiene horario de 08:30:00 a 09:30:00")));
    }

    #[tokio::test]
    async fn create_rejects_subgroup_when_trunk_common_is_busy() {
        let service = build_service(vec![sample_slot(10, 1, None, 1, "08:30", "09:30")], vec![]);

        let result = service
            .create(sample_create_input(Some("A"), "08:00", "09:00"))
            .await;

        assert!(matches!(result, Err(DomainError::Conflict(message)) if message.contains("El tronco común del grupo 1A ya tiene horario de 08:30:00 a 09:30:00")));
    }

    #[tokio::test]
    async fn create_allows_different_sibling_subgroups() {
        let service = build_service(vec![sample_slot(10, 1, Some("A"), 1, "08:30", "09:30")], vec![]);

        let result = service
            .create(sample_create_input(Some("B"), "08:00", "09:00"))
            .await
            .expect("la creación debería funcionar");

        assert_eq!(result.subgroup.as_deref(), Some("B"));
    }

    #[tokio::test]
    async fn create_many_rejects_overlapping_group_and_subgroup_in_same_batch() {
        let service = build_service(vec![], vec![]);

        let result = service
            .create_many(vec![
                sample_create_input(None, "08:00", "09:00"),
                sample_create_input(Some("A"), "08:30", "09:30"),
            ])
            .await;

        assert!(matches!(result, Err(DomainError::Conflict(message)) if message.contains("grupo y sus subgrupos")));
    }

    #[tokio::test]
    async fn create_many_allows_overlapping_sibling_subgroups() {
        let service = build_service(vec![], vec![]);

        let result = service
            .create_many(vec![
                sample_create_input_with(Some(1), 1, 1, Some("A"), "08:00", "09:00"),
                sample_create_input_with(None, 2, 1, Some("B"), "08:30", "09:30"),
            ])
            .await
            .expect("la creación debería funcionar");

        assert_eq!(result.len(), 2);
    }

    #[tokio::test]
    async fn create_rejects_overlapping_classroom_regardless_of_group() {
        let service = build_service(
            vec![],
            vec![sample_slot(10, 1, Some("A"), 1, "08:30", "09:30")],
        );

        let result = service
            .create(sample_create_input_with(None, 1, 2, Some("B"), "08:00", "09:00"))
            .await;

        assert!(matches!(result, Err(DomainError::Conflict(message)) if message.contains("El salón ya está ocupado de 08:30:00 a 09:30:00")));
    }
}
