use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::classroom::Classroom,
    ports::classroom_repository::ClassroomRepository,
    validation::normalize_required_text,
};

#[derive(Clone)]
pub struct ClassroomService {
    repo: Arc<dyn ClassroomRepository>,
}

impl ClassroomService {
    pub fn new(repo: Arc<dyn ClassroomRepository>) -> Self {
        Self { repo }
    }

    pub async fn find_all(&self) -> Result<Vec<Classroom>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Classroom>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn find_by_name_and_building(&self, name: &str, building_id: i32) -> Result<Option<Classroom>, DomainError> {
        self.repo.find_by_name_and_building(name, building_id).await
    }

    pub async fn create(&self, name: &str, building_id: Option<i32>) -> Result<Classroom, DomainError> {
        let name = normalize_required_text("Nombre del aula", name)?;
        let building_id = building_id.ok_or_else(|| DomainError::BadRequest("El edificio es requerido".to_string()))?;

        if self.repo.find_by_name_and_building(&name, building_id).await?.is_some() {
            return Err(DomainError::Conflict("El aula ya existe en ese edificio".to_string()));
        }

        self.repo.create(&name, Some(building_id)).await
    }

    pub async fn update(&self, id: i32, name: Option<&str>, building_id: Option<Option<i32>>) -> Result<Classroom, DomainError> {
        let mut current = self
            .repo
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Classroom not found".to_string()))?;

        if let Some(name) = name {
            current.name = normalize_required_text("Nombre del aula", name)?;
        }

        if let Some(building_id) = building_id {
            current.building_id = building_id;
        }

        let building_id = current
            .building_id
            .ok_or_else(|| DomainError::BadRequest("El edificio es requerido".to_string()))?;

        if let Some(existing) = self.repo.find_by_name_and_building(&current.name, building_id).await? {
            if existing.id != id {
                return Err(DomainError::Conflict("El aula ya existe en ese edificio".to_string()));
            }
        }

        current.building_id = Some(building_id);

        self.repo.update(id, Some(&current.name), Some(current.building_id)).await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }
}
