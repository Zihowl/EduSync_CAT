use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::auth::middleware::require_super_admin,
    adapters::graphql::{
        schema::to_gql_error,
        types::{allowed_domain_type::AllowedDomainType, school_year_type::SchoolYearType},
    },
    domain::services::config_service::ConfigService,
};

#[derive(Default)]
pub struct ConfigQuery;

#[Object]
impl ConfigQuery {
    #[graphql(name = "GetAllowedDomains")]
    async fn get_allowed_domains(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<AllowedDomainType>> {
        let _ = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        svc.get_allowed_domains()
            .await
            .map(|v| v.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    #[graphql(name = "GetCurrentSchoolYear")]
    async fn get_current_school_year(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Option<SchoolYearType>> {
        let _ = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        svc.get_current_school_year()
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::{Arc, Mutex};

    use async_graphql::{EmptyMutation, EmptySubscription, Request, Schema};
    use async_trait::async_trait;
    use chrono::Utc;
    use uuid::Uuid;

    use crate::{
        adapters::auth::middleware::AuthUser,
        domain::{
            errors::DomainError,
            models::{allowed_domain::AllowedDomain, school_year::SchoolYear},
            ports::{
                allowed_domain_repository::AllowedDomainRepository,
                school_year_repository::SchoolYearRepository,
            },
            services::config_service::ConfigService,
        },
    };

    struct MockAllowedDomainRepository {
        domains: Mutex<Vec<AllowedDomain>>,
    }

    impl MockAllowedDomainRepository {
        fn new(domains: Vec<AllowedDomain>) -> Self {
            Self {
                domains: Mutex::new(domains),
            }
        }
    }

    #[async_trait]
    impl AllowedDomainRepository for MockAllowedDomainRepository {
        async fn find_all(&self) -> Result<Vec<AllowedDomain>, DomainError> {
            Ok(self.domains.lock().unwrap().clone())
        }

        async fn find_by_domain(&self, domain: &str) -> Result<Option<AllowedDomain>, DomainError> {
            Ok(self
                .domains
                .lock()
                .unwrap()
                .iter()
                .find(|entry| entry.domain == domain)
                .cloned())
        }

        async fn create(&self, domain: &str) -> Result<AllowedDomain, DomainError> {
            let mut domains = self.domains.lock().unwrap();
            let record = AllowedDomain {
                id: (domains.len() as i32) + 1,
                domain: domain.to_string(),
            };
            domains.push(record.clone());
            Ok(record)
        }

        async fn delete(&self, id: i32) -> Result<bool, DomainError> {
            let mut domains = self.domains.lock().unwrap();
            let before = domains.len();
            domains.retain(|entry| entry.id != id);
            Ok(domains.len() != before)
        }
    }

    struct MockSchoolYearRepository {
        current: Mutex<Option<SchoolYear>>,
    }

    impl MockSchoolYearRepository {
        fn new(current: Option<SchoolYear>) -> Self {
            Self {
                current: Mutex::new(current),
            }
        }
    }

    #[async_trait]
    impl SchoolYearRepository for MockSchoolYearRepository {
        async fn get_current(&self) -> Result<Option<SchoolYear>, DomainError> {
            Ok(self.current.lock().unwrap().clone())
        }

        async fn set_current(
            &self,
            start_date: &str,
            end_date: &str,
        ) -> Result<SchoolYear, DomainError> {
            let record = SchoolYear {
                id: 1,
                start_date: start_date.to_string(),
                end_date: end_date.to_string(),
                created_at: Utc::now(),
            };
            *self.current.lock().unwrap() = Some(record.clone());
            Ok(record)
        }
    }

    fn build_schema() -> Schema<ConfigQuery, EmptyMutation, EmptySubscription> {
        let domain_repo = Arc::new(MockAllowedDomainRepository::new(vec![
            AllowedDomain {
                id: 1,
                domain: "example.com".to_string(),
            },
            AllowedDomain {
                id: 2,
                domain: "school.edu".to_string(),
            },
        ]));
        let school_year_repo = Arc::new(MockSchoolYearRepository::new(Some(SchoolYear {
            id: 1,
            start_date: "2026-08-01".to_string(),
            end_date: "2027-07-31".to_string(),
            created_at: Utc::now(),
        })));
        let service = Arc::new(ConfigService::new(domain_repo, school_year_repo));

        Schema::build(ConfigQuery::default(), EmptyMutation, EmptySubscription)
            .data(service)
            .finish()
    }

    fn auth_user(role: &str) -> AuthUser {
        AuthUser {
            user_id: Uuid::new_v4(),
            email: "admin@example.com".to_string(),
            role: role.to_string(),
        }
    }

    fn assert_no_authorization_error(response: &async_graphql::Response) {
        assert!(
            response
                .errors
                .iter()
                .any(|error| error.message == "No autorizado"),
            "unexpected errors: {:?}",
            response.errors
        );
    }

    fn assert_access_denied_error(response: &async_graphql::Response) {
        assert!(
            response
                .errors
                .iter()
                .any(|error| error.message == "Acceso denegado"),
            "unexpected errors: {:?}",
            response.errors
        );
    }

    #[tokio::test]
    async fn config_queries_require_super_admin() {
        let schema = build_schema();
        let admin = auth_user("ADMIN_HORARIOS");
        let super_admin = auth_user("SUPER_ADMIN");

        for query in [
            "{ GetAllowedDomains { id domain } }",
            "{ GetCurrentSchoolYear { id startDate endDate createdAt } }",
        ] {
            let response = schema.execute(Request::new(query)).await;
            assert_no_authorization_error(&response);

            let response = schema
                .execute(Request::new(query).data(admin.clone()))
                .await;
            assert_access_denied_error(&response);

            let response = schema
                .execute(Request::new(query).data(super_admin.clone()))
                .await;
            assert!(
                response.errors.is_empty(),
                "unexpected errors: {:?}",
                response.errors
            );
        }
    }
}
