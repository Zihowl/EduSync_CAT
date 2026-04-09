use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::teacher::Teacher,
    ports::teacher_repository::TeacherRepository,
    validation::{normalize_optional_email, normalize_required_text},
};

#[derive(Clone)]
pub struct TeacherService {
    repo: Arc<dyn TeacherRepository>,
}

impl TeacherService {
    pub fn new(repo: Arc<dyn TeacherRepository>) -> Self {
        Self { repo }
    }

    pub async fn find_all(&self) -> Result<Vec<Teacher>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Teacher>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn create(&self, employee_number: &str, name: &str, email: Option<&str>) -> Result<Teacher, DomainError> {
        let employee_number = normalize_required_text("Número de empleado", employee_number)?;
        let name = normalize_required_text("Nombre del docente", name)?;
        let email = normalize_optional_email(email);

        if self.repo.find_by_employee_number(&employee_number).await?.is_some() {
            return Err(DomainError::Conflict("El número de empleado ya existe".to_string()));
        }

        if let Some(email) = email.as_deref() {
            if self.repo.find_by_email(email).await?.is_some() {
                return Err(DomainError::Conflict("El correo ya está registrado".to_string()));
            }
        }

        self.repo.create(&employee_number, &name, email.as_deref()).await
    }

    pub async fn update(
        &self,
        id: i32,
        employee_number: Option<&str>,
        name: Option<&str>,
        email: Option<Option<&str>>,
    ) -> Result<Teacher, DomainError> {
        let mut current = self
            .repo
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Docente no encontrado".to_string()))?;

        if let Some(employee_number) = employee_number {
            let employee_number = normalize_required_text("Número de empleado", employee_number)?;
            if employee_number != current.employee_number {
                if let Some(existing) = self.repo.find_by_employee_number(&employee_number).await? {
                    if existing.id != id {
                        return Err(DomainError::Conflict("El número de empleado ya existe".to_string()));
                    }
                }
            }
            current.employee_number = employee_number;
        }

        if let Some(name) = name {
            current.name = normalize_required_text("Nombre del docente", name)?;
        }

        if let Some(email) = email {
            let normalized_email = normalize_optional_email(email);
            if let Some(email) = normalized_email.as_deref() {
                if current.email.as_deref() != Some(email) {
                    if let Some(existing) = self.repo.find_by_email(email).await? {
                        if existing.id != id {
                            return Err(DomainError::Conflict("El correo ya está registrado".to_string()));
                        }
                    }
                }
            }
            current.email = normalized_email;
        }

        self.repo
            .update(id, Some(&current.employee_number), Some(&current.name), Some(current.email.as_deref()))
            .await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }
}
