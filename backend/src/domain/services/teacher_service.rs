use std::sync::Arc;

use crate::domain::{
    errors::DomainError,
    models::teacher::Teacher,
    ports::{
        allowed_domain_repository::AllowedDomainRepository,
        teacher_repository::TeacherRepository,
    },
    validation::{normalize_optional_email, normalize_required_text},
};
use regex::Regex;

#[derive(Clone)]
pub struct TeacherService {
    repo: Arc<dyn TeacherRepository>,
    allowed_domain_repo: Arc<dyn AllowedDomainRepository>,
}

impl TeacherService {
    pub fn new(
        repo: Arc<dyn TeacherRepository>,
        allowed_domain_repo: Arc<dyn AllowedDomainRepository>,
    ) -> Self {
        Self {
            repo,
            allowed_domain_repo,
        }
    }

    pub async fn find_all(&self) -> Result<Vec<Teacher>, DomainError> {
        self.repo.find_all().await
    }

    pub async fn find_one(&self, id: i32) -> Result<Option<Teacher>, DomainError> {
        self.repo.find_by_id(id).await
    }

    pub async fn create(
        &self,
        employee_number: &str,
        name: &str,
        email: Option<&str>,
    ) -> Result<Teacher, DomainError> {
        let employee_number = normalize_required_text("Número de empleado", employee_number)?;
        let name = normalize_required_text("Nombre del docente", name)?;
        let email = self.normalize_and_validate_email(email).await?;

        if self
            .repo
            .find_by_employee_number(&employee_number)
            .await?
            .is_some()
        {
            return Err(DomainError::Conflict(
                "El número de empleado ya existe".to_string(),
            ));
        }

        if let Some(email) = email.as_deref() {
            if self.repo.find_by_email(email).await?.is_some() {
                return Err(DomainError::Conflict(
                    "El correo ya está registrado".to_string(),
                ));
            }
        }

        self.repo
            .create(&employee_number, &name, email.as_deref())
            .await
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
                        return Err(DomainError::Conflict(
                            "El número de empleado ya existe".to_string(),
                        ));
                    }
                }
            }
            current.employee_number = employee_number;
        }

        if let Some(name) = name {
            current.name = normalize_required_text("Nombre del docente", name)?;
        }

        if let Some(email) = email {
            current.email = self.normalize_and_validate_email(email).await?;

            if let Some(email) = current.email.as_deref() {
                if let Some(existing) = self.repo.find_by_email(email).await? {
                    if existing.id != id {
                        return Err(DomainError::Conflict(
                            "El correo ya está registrado".to_string(),
                        ));
                    }
                }
            }
        }

        self.repo
            .update(
                id,
                Some(&current.employee_number),
                Some(&current.name),
                Some(current.email.as_deref()),
            )
            .await
    }

    pub async fn delete(&self, id: i32) -> Result<bool, DomainError> {
        self.repo.delete(id).await
    }

    async fn normalize_and_validate_email(
        &self,
        email: Option<&str>,
    ) -> Result<Option<String>, DomainError> {
        let normalized_email = normalize_optional_email(email);

        if let Some(email) = normalized_email.as_deref() {
            self.ensure_email_format(email)?;
            self.ensure_domain_allowed(email).await?;
        }

        Ok(normalized_email)
    }

    fn ensure_email_format(&self, email: &str) -> Result<(), DomainError> {
        let re = Regex::new(
            r"^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$",
        )
        .map_err(|e| DomainError::Internal(format!("Regex inválida: {e}")))?;

        if !re.is_match(email) {
            return Err(DomainError::BadRequest(
                "Correo electrónico inválido".to_string(),
            ));
        }

        Ok(())
    }

    async fn ensure_domain_allowed(&self, email: &str) -> Result<(), DomainError> {
        let domain = email
            .split_once('@')
            .ok_or_else(|| DomainError::BadRequest("Correo electrónico inválido".to_string()))?
            .1;

        if self
            .allowed_domain_repo
            .find_by_domain(domain)
            .await?
            .is_none()
        {
            return Err(DomainError::BadRequest(format!(
                "El dominio @{domain} no está permitido"
            )));
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::{
        models::{allowed_domain::AllowedDomain, teacher::Teacher},
        ports::{
            allowed_domain_repository::AllowedDomainRepository,
            teacher_repository::TeacherRepository,
        },
    };
    use async_trait::async_trait;
    use std::sync::{Arc, Mutex};

    struct MockAllowedDomainRepository {
        domains: Vec<String>,
    }

    impl MockAllowedDomainRepository {
        fn new(domains: Vec<&str>) -> Self {
            Self {
                domains: domains.into_iter().map(ToString::to_string).collect(),
            }
        }
    }

    #[async_trait]
    impl AllowedDomainRepository for MockAllowedDomainRepository {
        async fn find_all(&self) -> Result<Vec<AllowedDomain>, DomainError> {
            Ok(self
                .domains
                .iter()
                .enumerate()
                .map(|(index, domain)| AllowedDomain {
                    id: (index + 1) as i32,
                    domain: domain.clone(),
                })
                .collect())
        }

        async fn find_by_domain(&self, domain: &str) -> Result<Option<AllowedDomain>, DomainError> {
            Ok(self
                .domains
                .iter()
                .enumerate()
                .find(|(_, stored_domain)| stored_domain.eq_ignore_ascii_case(domain))
                .map(|(index, stored_domain)| AllowedDomain {
                    id: (index + 1) as i32,
                    domain: stored_domain.clone(),
                }))
        }

        async fn create(&self, domain: &str) -> Result<AllowedDomain, DomainError> {
            Ok(AllowedDomain {
                id: 1,
                domain: domain.to_string(),
            })
        }

        async fn delete(&self, _id: i32) -> Result<bool, DomainError> {
            Ok(false)
        }
    }

    struct MockTeacherRepository {
        teachers: Mutex<Vec<Teacher>>, 
        next_id: Mutex<i32>,
    }

    impl MockTeacherRepository {
        fn new(teachers: Vec<Teacher>) -> Self {
            let next_id = teachers.iter().map(|teacher| teacher.id).max().unwrap_or(0) + 1;
            Self {
                teachers: Mutex::new(teachers),
                next_id: Mutex::new(next_id),
            }
        }
    }

    #[async_trait]
    impl TeacherRepository for MockTeacherRepository {
        async fn find_all(&self) -> Result<Vec<Teacher>, DomainError> {
            Ok(self.teachers.lock().unwrap().clone())
        }

        async fn find_by_id(&self, id: i32) -> Result<Option<Teacher>, DomainError> {
            Ok(self
                .teachers
                .lock()
                .unwrap()
                .iter()
                .find(|teacher| teacher.id == id)
                .cloned())
        }

        async fn find_by_employee_number(
            &self,
            employee_number: &str,
        ) -> Result<Option<Teacher>, DomainError> {
            Ok(self
                .teachers
                .lock()
                .unwrap()
                .iter()
                .find(|teacher| teacher.employee_number == employee_number)
                .cloned())
        }

        async fn find_by_email(&self, email: &str) -> Result<Option<Teacher>, DomainError> {
            Ok(self
                .teachers
                .lock()
                .unwrap()
                .iter()
                .find(|teacher| teacher.email.as_deref() == Some(email))
                .cloned())
        }

        async fn create(
            &self,
            employee_number: &str,
            name: &str,
            email: Option<&str>,
        ) -> Result<Teacher, DomainError> {
            let mut teachers = self.teachers.lock().unwrap();
            let mut next_id = self.next_id.lock().unwrap();
            let teacher = Teacher {
                id: *next_id,
                employee_number: employee_number.to_string(),
                name: name.to_string(),
                email: email.map(ToString::to_string),
            };
            *next_id += 1;
            teachers.push(teacher.clone());
            Ok(teacher)
        }

        async fn update(
            &self,
            id: i32,
            employee_number: Option<&str>,
            name: Option<&str>,
            email: Option<Option<&str>>,
        ) -> Result<Teacher, DomainError> {
            let mut teachers = self.teachers.lock().unwrap();
            let teacher = teachers
                .iter_mut()
                .find(|teacher| teacher.id == id)
                .ok_or_else(|| DomainError::NotFound("Docente no encontrado".to_string()))?;

            if let Some(employee_number) = employee_number {
                teacher.employee_number = employee_number.to_string();
            }

            if let Some(name) = name {
                teacher.name = name.to_string();
            }

            if let Some(email) = email {
                teacher.email = email.map(ToString::to_string);
            }

            Ok(teacher.clone())
        }

        async fn delete(&self, id: i32) -> Result<bool, DomainError> {
            let mut teachers = self.teachers.lock().unwrap();
            let initial_len = teachers.len();
            teachers.retain(|teacher| teacher.id != id);
            Ok(teachers.len() != initial_len)
        }
    }

    fn make_teacher(id: i32, employee_number: &str, name: &str, email: Option<&str>) -> Teacher {
        Teacher {
            id,
            employee_number: employee_number.to_string(),
            name: name.to_string(),
            email: email.map(ToString::to_string),
        }
    }

    fn build_service(
        teachers: Vec<Teacher>,
    ) -> (TeacherService, Arc<MockTeacherRepository>, Arc<MockAllowedDomainRepository>) {
        let repo = Arc::new(MockTeacherRepository::new(teachers));
        let allowed_domain_repo = Arc::new(MockAllowedDomainRepository::new(vec!["school.edu"]));
        (
            TeacherService::new(repo.clone(), allowed_domain_repo.clone()),
            repo,
            allowed_domain_repo,
        )
    }

    #[tokio::test]
    async fn test_create_normalizes_and_accepts_allowed_domain() {
        let (service, repo, _allowed_domain_repo) = build_service(vec![]);

        let created = service
            .create("12345", "Docente", Some("Docente@School.EDU"))
            .await
            .expect("debe crear docente");

        assert_eq!(created.email.as_deref(), Some("docente@school.edu"));
        assert_eq!(repo.teachers.lock().unwrap().len(), 1);
        assert_eq!(repo.teachers.lock().unwrap()[0].email.as_deref(), Some("docente@school.edu"));
    }

    #[tokio::test]
    async fn test_create_rejects_unallowed_domain() {
        let (service, repo, _allowed_domain_repo) = build_service(vec![]);

        let result = service
            .create("12345", "Docente", Some("Docente@otro.edu"))
            .await;

        assert!(matches!(result, Err(DomainError::BadRequest(msg)) if msg.contains("@otro.edu")));
        assert!(repo.teachers.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_update_rejects_unallowed_domain() {
        let (service, repo, _allowed_domain_repo) = build_service(vec![make_teacher(
            1,
            "12345",
            "Docente",
            Some("docente@school.edu"),
        )]);

        let result = service
            .update(1, None, None, Some(Some("Docente@otro.edu")))
            .await;

        assert!(matches!(result, Err(DomainError::BadRequest(msg)) if msg.contains("@otro.edu")));
        assert_eq!(repo.teachers.lock().unwrap()[0].email.as_deref(), Some("docente@school.edu"));
    }
}
