use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::subject::Subject,
    ports::subject_repository::SubjectRepository,
    validation::{normalize_optional_text, normalize_required_text},
};

#[derive(Clone)]
pub struct SubjectService {
    repo: Arc<dyn SubjectRepository>,
}

impl SubjectService {
    pub fn new(repo: Arc<dyn SubjectRepository>) -> Self {
        Self { repo }
    }

    pub async fn find_all(&self) -> Result<Vec<Subject>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Subject>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn create(
        &self,
        code: &str,
        name: &str,
        grade: Option<i32>,
        division: Option<&str>,
    ) -> Result<Subject, DomainError> {
        let code = normalize_required_text("Clave de materia", code)?;
        let name = normalize_required_text("Nombre de la materia", name)?;
        let division = normalize_optional_text(division);

        if self.repo.find_by_code(&code).await?.is_some() {
            return Err(DomainError::Conflict("El código de materia ya existe".to_string()));
        }
        self.repo
            .create(&code, &name, grade, division.as_deref())
            .await
    }

    pub async fn update(
        &self,
        id: i32,
        code: Option<&str>,
        name: Option<&str>,
        grade: Option<i32>,
        division: Option<&str>,
    ) -> Result<Subject, DomainError> {
        let mut current = self
            .repo
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Materia no encontrada".to_string()))?;

        if let Some(code) = code {
            let code = normalize_required_text("Clave de materia", code)?;
            if code != current.code {
                if let Some(existing) = self.repo.find_by_code(&code).await? {
                    if existing.id != id {
                        return Err(DomainError::Conflict("El código de materia ya existe".to_string()));
                    }
                }
            }
            current.code = code;
        }

        if let Some(name) = name {
            current.name = normalize_required_text("Nombre de la materia", name)?;
        }

        if let Some(grade) = grade {
            current.grade = Some(grade);
        }

        if let Some(division) = division {
            current.division = normalize_optional_text(Some(division));
        }

        self.repo
            .update(id, Some(&current.code), Some(&current.name), current.grade, current.division.as_deref())
            .await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }
}
