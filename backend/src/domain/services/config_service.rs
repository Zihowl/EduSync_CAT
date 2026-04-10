use std::{collections::HashSet, sync::Arc};

use chrono::NaiveDate;
use regex::Regex;

use crate::domain::{
    errors::DomainError,
    models::{
        allowed_domain::{AllowedDomain, AllowedDomainWithUsage},
        school_year::SchoolYear,
    },
    ports::{
        allowed_domain_repository::AllowedDomainRepository,
        school_year_repository::SchoolYearRepository,
        user_repository::UserRepository,
    },
};

#[derive(Clone)]
pub struct ConfigService {
    domain_repo: Arc<dyn AllowedDomainRepository>,
    user_repo: Arc<dyn UserRepository>,
    school_year_repo: Arc<dyn SchoolYearRepository>,
}

impl ConfigService {
    pub fn new(
        domain_repo: Arc<dyn AllowedDomainRepository>,
        user_repo: Arc<dyn UserRepository>,
        school_year_repo: Arc<dyn SchoolYearRepository>,
    ) -> Self {
        Self {
            domain_repo,
            user_repo,
            school_year_repo,
        }
    }

    pub async fn create_domain(&self, domain: &str) -> Result<AllowedDomain, DomainError> {
        let domain = domain.trim().to_lowercase();
        self.validate_domain_format(&domain)?;

        if self.domain_repo.find_by_domain(&domain).await?.is_some() {
            return Err(DomainError::Conflict("El dominio ya existe".to_string()));
        }

        self.domain_repo.create(&domain).await
    }

    pub async fn get_allowed_domains(&self) -> Result<Vec<AllowedDomainWithUsage>, DomainError> {
        let domains = self.domain_repo.find_all().await?;
        let active_domains = self.active_user_domains().await?;

        Ok(domains
            .into_iter()
            .map(|domain| {
                let normalized_domain = domain.domain.to_ascii_lowercase();
                let has_active_users = active_domains.contains(&normalized_domain);
                AllowedDomainWithUsage {
                    id: domain.id,
                    domain: domain.domain,
                    has_active_users,
                }
            })
            .collect())
    }

    pub async fn remove_domain(&self, id: i32) -> Result<bool, DomainError> {
        let domain = self
            .domain_repo
            .find_all()
            .await?
            .into_iter()
            .find(|entry| entry.id == id)
            .ok_or_else(|| DomainError::NotFound("Dominio no encontrado".to_string()))?;

        if self
            .user_repo
            .has_active_user_with_domain(&domain.domain)
            .await?
        {
            return Err(DomainError::Conflict(
                "No se puede eliminar el dominio porque existen usuarios activos asociados"
                    .to_string(),
            ));
        }

        self.domain_repo.delete(id).await
    }

    pub async fn set_current_school_year(
        &self,
        start_date: &str,
        end_date: &str,
    ) -> Result<SchoolYear, DomainError> {
        let start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d").map_err(|_| {
            DomainError::BadRequest("Formato de fecha inválido. Usa YYYY-MM-DD".to_string())
        })?;
        let end = NaiveDate::parse_from_str(end_date, "%Y-%m-%d").map_err(|_| {
            DomainError::BadRequest("Formato de fecha inválido. Usa YYYY-MM-DD".to_string())
        })?;

        if start > end {
            return Err(DomainError::BadRequest(
                "La fecha de inicio debe ser anterior o igual a la fecha de fin".to_string(),
            ));
        }

        self.school_year_repo
            .set_current(start_date, end_date)
            .await
    }

    pub async fn get_current_school_year(&self) -> Result<Option<SchoolYear>, DomainError> {
        self.school_year_repo.get_current().await
    }

    fn validate_domain_format(&self, domain: &str) -> Result<(), DomainError> {
        if domain.is_empty() {
            return Err(DomainError::BadRequest(
                "El dominio es requerido".to_string(),
            ));
        }
        if domain.len() > 255 {
            return Err(DomainError::BadRequest(
                "El dominio es demasiado largo".to_string(),
            ));
        }
        if !domain.contains('.') {
            return Err(DomainError::BadRequest(
                "El dominio debe contener un punto".to_string(),
            ));
        }

        let regex = Regex::new(
            r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$",
        )
        .map_err(|e| DomainError::Internal(format!("Regex inválida: {e}")))?;
        if !regex.is_match(domain) {
            return Err(DomainError::BadRequest(
                "Formato de dominio inválido".to_string(),
            ));
        }
        Ok(())
    }

    async fn active_user_domains(&self) -> Result<HashSet<String>, DomainError> {
        let users = self.user_repo.find_all().await?;
        Ok(users
            .into_iter()
            .filter(|user| user.is_active)
            .filter_map(|user| {
                user.email
                    .split_once('@')
                    .map(|(_, domain)| domain.to_ascii_lowercase())
            })
            .collect())
    }
}
