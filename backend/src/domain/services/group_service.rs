use std::{collections::HashSet, sync::Arc};

use crate::domain::{
    errors::DomainError, models::group::Group, ports::group_repository::GroupRepository,
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

    pub async fn find_by_name_and_parent(
        &self,
        name: &str,
        parent_id: Option<i32>,
    ) -> Result<Option<Group>, DomainError> {
        let name = normalize_required_text("Nombre del grupo", name)?;
        self.repo.find_by_name_and_parent(&name, parent_id).await
    }

    pub async fn find_or_create(
        &self,
        name: &str,
        parent_id: Option<i32>,
        grade: Option<i32>,
    ) -> Result<Group, DomainError> {
        let name = normalize_required_text("Nombre del grupo", name)?;

        if let Some(existing) = self.repo.find_by_name_and_parent(&name, parent_id).await? {
            if grade.is_some() && existing.grade != grade {
                return self
                    .repo
                    .update(existing.id, None, None, Some(grade))
                    .await;
            }

            return Ok(existing);
        }

        self.validate_parent_link(None, parent_id).await?;

        self.repo.create(&name, parent_id, grade).await
    }

    pub async fn create(
        &self,
        name: &str,
        parent_id: Option<i32>,
        grade: Option<i32>,
    ) -> Result<Group, DomainError> {
        let name = normalize_required_text("Nombre del grupo", name)?;

        if self
            .repo
            .find_by_name_and_parent(&name, parent_id)
            .await?
            .is_some()
        {
            return Err(DomainError::Conflict("El grupo ya existe".to_string()));
        }

        self.validate_parent_link(None, parent_id).await?;

        self.repo.create(&name, parent_id, grade).await
    }

    pub async fn update(
        &self,
        id: i32,
        name: Option<&str>,
        parent_id: Option<Option<i32>>,
        grade: Option<Option<i32>>,
    ) -> Result<Group, DomainError> {
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

        if let Some(existing) = self
            .repo
            .find_by_name_and_parent(&new_name, new_parent_id)
            .await?
        {
            if existing.id != id {
                return Err(DomainError::Conflict("El grupo ya existe".to_string()));
            }
        }

        if let Some(parent_id) = new_parent_id {
            self.validate_parent_link(Some(id), Some(parent_id)).await?;
        }

        self.repo
            .update(id, Some(&new_name), Some(new_parent_id), grade)
            .await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }

    async fn validate_parent_link(
        &self,
        current_group_id: Option<i32>,
        parent_id: Option<i32>,
    ) -> Result<(), DomainError> {
        let Some(mut next_parent_id) = parent_id else {
            return Ok(());
        };

        let mut visited = HashSet::new();

        loop {
            if !visited.insert(next_parent_id) {
                return Err(DomainError::BadRequest(
                    "La jerarquía de grupos contiene un ciclo".to_string(),
                ));
            }

            let parent =
                self.repo.find_by_id(next_parent_id).await?.ok_or_else(|| {
                    DomainError::NotFound("Grupo padre no encontrado".to_string())
                })?;

            if let Some(group_id) = current_group_id {
                if parent.id == group_id {
                    return Err(DomainError::BadRequest(
                        "Un grupo no puede ser su propio subgrupo".to_string(),
                    ));
                }
            }

            match parent.parent_id {
                Some(parent_parent_id) => next_parent_id = parent_parent_id,
                None => return Ok(()),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::GroupService;
    use async_trait::async_trait;
    use std::sync::{Arc, Mutex};

    use crate::domain::{
        errors::DomainError,
        models::group::Group,
        ports::group_repository::GroupRepository,
    };

    #[derive(Default)]
    struct MockGroupRepository {
        existing: Option<Group>,
        parent: Option<Group>,
        created: Mutex<Vec<(String, Option<i32>, Option<i32>)>>,
        updated: Mutex<Vec<(i32, Option<String>, Option<Option<i32>>, Option<Option<i32>>)>>,
    }

    impl MockGroupRepository {
        fn with_existing(existing: Option<Group>) -> Self {
            Self {
                existing,
                ..Self::default()
            }
        }

        fn with_parent(parent: Option<Group>) -> Self {
            Self {
                parent,
                ..Self::default()
            }
        }
    }

    #[async_trait]
    impl GroupRepository for MockGroupRepository {
        async fn find_all(&self) -> Result<Vec<Group>, DomainError> {
            Ok(vec![])
        }

        async fn find_by_id(&self, id: i32) -> Result<Option<Group>, DomainError> {
            if self.parent.as_ref().map(|group| group.id) == Some(id) {
                return Ok(self.parent.clone());
            }

            if self.existing.as_ref().map(|group| group.id) == Some(id) {
                return Ok(self.existing.clone());
            }

            Ok(None)
        }

        async fn find_by_name_and_parent(
            &self,
            name: &str,
            parent_id: Option<i32>,
        ) -> Result<Option<Group>, DomainError> {
            let Some(existing) = &self.existing else {
                return Ok(None);
            };

            if existing.name == name && existing.parent_id == parent_id {
                Ok(Some(existing.clone()))
            } else {
                Ok(None)
            }
        }

        async fn create(
            &self,
            name: &str,
            parent_id: Option<i32>,
            grade: Option<i32>,
        ) -> Result<Group, DomainError> {
            self.created
                .lock()
                .expect("created mutex poisoned")
                .push((name.to_string(), parent_id, grade));

            Ok(Group {
                id: 99,
                name: name.to_string(),
                parent_id,
                grade,
            })
        }

        async fn update(
            &self,
            id: i32,
            name: Option<&str>,
            parent_id: Option<Option<i32>>,
            grade: Option<Option<i32>>,
        ) -> Result<Group, DomainError> {
            self.updated
                .lock()
                .expect("updated mutex poisoned")
                .push((id, name.map(str::to_string), parent_id, grade));

            let mut group = self.existing.clone().unwrap_or(Group {
                id,
                name: String::new(),
                parent_id: None,
                grade: None,
            });

            if let Some(name) = name {
                group.name = name.to_string();
            }
            if let Some(parent_id) = parent_id {
                group.parent_id = parent_id;
            }
            if let Some(grade) = grade {
                group.grade = grade;
            }

            Ok(group)
        }

        async fn delete(&self, _id: i32) -> Result<bool, DomainError> {
            Ok(true)
        }
    }

    #[tokio::test]
    async fn find_or_create_creates_subgroup_with_grade() {
        let repo = Arc::new(MockGroupRepository::with_parent(Some(Group {
            id: 1,
            name: "1A".to_string(),
            parent_id: None,
            grade: Some(1),
        })));
        let service = GroupService::new(repo.clone());

        let group = service
            .find_or_create("1", Some(1), Some(1))
            .await
            .expect("el subgrupo debe crearse");

        assert_eq!(group.grade, Some(1));
        assert_eq!(repo.created.lock().expect("created mutex").len(), 1);
        assert_eq!(repo.created.lock().expect("created mutex")[0], ("1".to_string(), Some(1), Some(1)));
    }

    #[tokio::test]
    async fn find_or_create_updates_existing_group_grade() {
        let repo = Arc::new(MockGroupRepository::with_existing(Some(Group {
            id: 2,
            name: "1A".to_string(),
            parent_id: None,
            grade: None,
        })));
        let service = GroupService::new(repo.clone());

        let group = service
            .find_or_create("1A", None, Some(1))
            .await
            .expect("el grupo debe sincronizar el grado");

        assert_eq!(group.grade, Some(1));
        assert_eq!(repo.updated.lock().expect("updated mutex").len(), 1);
        assert_eq!(repo.updated.lock().expect("updated mutex")[0].3, Some(Some(1)));
    }
}
