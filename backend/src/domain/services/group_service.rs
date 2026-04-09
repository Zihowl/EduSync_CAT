use std::{collections::HashSet, sync::Arc};

use crate::domain::{
    errors::DomainError,
    models::group::Group,
    ports::group_repository::GroupRepository,
    validation::normalize_required_text,
};

#[derive(Clone)]
pub struct GroupService {
    repo: Arc<dyn GroupRepository>,
}

impl GroupService {
    pub fn new(repo: Arc<dyn GroupRepository>) -> Self {
        Self { repo }
    }

    pub async fn find_all(&self) -> Result<Vec<Group>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Group>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn find_by_name_and_parent(&self, name: &str, parent_id: Option<i32>) -> Result<Option<Group>, DomainError> {
        let name = normalize_required_text("Nombre del grupo", name)?;
        self.repo.find_by_name_and_parent(&name, parent_id).await
    }

    pub async fn find_or_create(&self, name: &str, parent_id: Option<i32>) -> Result<Group, DomainError> {
        let name = normalize_required_text("Nombre del grupo", name)?;

        if let Some(existing) = self.repo.find_by_name_and_parent(&name, parent_id).await? {
            return Ok(existing);
        }

        self.validate_parent_link(None, parent_id).await?;

        self.repo.create(&name, parent_id).await
    }

    pub async fn create(&self, name: &str, parent_id: Option<i32>) -> Result<Group, DomainError> {
        let name = normalize_required_text("Nombre del grupo", name)?;

        if self.repo.find_by_name_and_parent(&name, parent_id).await?.is_some() {
            return Err(DomainError::Conflict("El grupo ya existe".to_string()));
        }

        self.validate_parent_link(None, parent_id).await?;

        self.repo.create(&name, parent_id).await
    }

    pub async fn update(&self, id: i32, name: Option<&str>, parent_id: Option<Option<i32>>) -> Result<Group, DomainError> {
        let mut current = self
            .repo
            .find_by_id(id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Grupo no encontrado".to_string()))?;

        let new_name = if let Some(name) = name {
            let name = normalize_required_text("Nombre del grupo", name)?;
            if name != current.name {
                current.name = name;
            }
            current.name.clone()
        } else {
            current.name.clone()
        };

        let new_parent_id = parent_id.unwrap_or(current.parent_id);

        if let Some(existing) = self.repo.find_by_name_and_parent(&new_name, new_parent_id).await? {
            if existing.id != id {
                return Err(DomainError::Conflict("El grupo ya existe".to_string()));
            }
        }

        if let Some(parent_id) = new_parent_id {
            self.validate_parent_link(Some(id), Some(parent_id)).await?;
        }

        self.repo.update(id, Some(&new_name), Some(new_parent_id)).await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }

    async fn validate_parent_link(&self, current_group_id: Option<i32>, parent_id: Option<i32>) -> Result<(), DomainError> {
        let Some(mut next_parent_id) = parent_id else {
            return Ok(());
        };

        let mut visited = HashSet::new();

        loop {
            if !visited.insert(next_parent_id) {
                return Err(DomainError::BadRequest("La jerarquía de grupos contiene un ciclo".to_string()));
            }

            let parent = self
                .repo
                .find_by_id(next_parent_id)
                .await?
                .ok_or_else(|| DomainError::NotFound("Grupo padre no encontrado".to_string()))?;

            if let Some(group_id) = current_group_id {
                if parent.id == group_id {
                    return Err(DomainError::BadRequest("Un grupo no puede ser su propio subgrupo".to_string()));
                }
            }

            match parent.parent_id {
                Some(parent_parent_id) => next_parent_id = parent_parent_id,
                None => return Ok(()),
            }
        }
    }
}
