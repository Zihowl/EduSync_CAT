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
            models::{allowed_domain::AllowedDomain, school_year::SchoolYear, user::{User, UserRole}},
            ports::{
                allowed_domain_repository::AllowedDomainRepository,
                school_year_repository::SchoolYearRepository,
                user_repository::UserRepository,
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

    struct MockUserRepository {
        users: Mutex<Vec<User>>,
    }

    impl MockUserRepository {
        fn new(users: Vec<User>) -> Self {
            Self {
                users: Mutex::new(users),
            }
        }
    }

    #[async_trait]
    impl UserRepository for MockUserRepository {
        async fn find_all(&self) -> Result<Vec<User>, DomainError> {
            Ok(self.users.lock().unwrap().clone())
        }

        async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, DomainError> {
            Ok(self
                .users
                .lock()
                .unwrap()
                .iter()
                .find(|user| user.id == id)
                .cloned())
        }

        async fn find_by_email(&self, email: &str) -> Result<Option<User>, DomainError> {
            Ok(self
                .users
                .lock()
                .unwrap()
                .iter()
                .find(|user| user.email == email)
                .cloned())
        }

        async fn create_admin(
            &self,
            _email: &str,
            _full_name: &str,
            _password_hash: &str,
            _is_super_admin: bool,
        ) -> Result<User, DomainError> {
            Err(DomainError::Internal("create_admin not implemented".into()))
        }

        async fn increment_failed_login_attempts(&self, _user_id: Uuid) -> Result<(), DomainError> {
            Err(DomainError::Internal(
                "increment_failed_login_attempts not implemented".into(),
            ))
        }

        async fn reset_failed_login_attempts(&self, _user_id: Uuid) -> Result<(), DomainError> {
            Err(DomainError::Internal(
                "reset_failed_login_attempts not implemented".into(),
            ))
        }

        async fn set_lockout_until(
            &self,
            _user_id: Uuid,
            _until: Option<chrono::DateTime<Utc>>,
        ) -> Result<(), DomainError> {
            Err(DomainError::Internal("set_lockout_until not implemented".into()))
        }

        async fn set_is_active(&self, _user_id: Uuid, _is_active: bool) -> Result<User, DomainError> {
            Err(DomainError::Internal("set_is_active not implemented".into()))
        }

        async fn update_credentials(
            &self,
            _user_id: Uuid,
            _email: &str,
            _password_hash: &str,
            _is_temp_password: bool,
        ) -> Result<User, DomainError> {
            Err(DomainError::Internal(
                "update_credentials not implemented".into(),
            ))
        }
    }

    fn sample_user(email: &str, is_active: bool) -> User {
        User {
            id: Uuid::new_v4(),
            email: email.to_string(),
            full_name: Some("Admin".to_string()),
            password_hash: "hash".to_string(),
            role: UserRole::AdminHorarios,
            is_active,
            is_temp_password: false,
            failed_login_attempts: 0,
            lockout_until: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
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
        let user_repo = Arc::new(MockUserRepository::new(vec![
            sample_user("active.teacher@school.edu", true),
            sample_user("inactive.teacher@example.com", false),
        ]));
        let school_year_repo = Arc::new(MockSchoolYearRepository::new(Some(SchoolYear {
            id: 1,
            start_date: "2026-08-01".to_string(),
            end_date: "2027-07-31".to_string(),
            created_at: Utc::now(),
        })));
        let service = Arc::new(ConfigService::new(domain_repo, user_repo, school_year_repo));

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
            "{ GetAllowedDomains { id domain hasActiveUsers } }",
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

    #[tokio::test]
    async fn allowed_domains_include_active_user_usage() {
        let schema = build_schema();
        let super_admin = auth_user("SUPER_ADMIN");

        let response = schema
            .execute(Request::new("{ GetAllowedDomains { domain hasActiveUsers } }").data(super_admin))
            .await;

        assert!(response.errors.is_empty(), "unexpected errors: {:?}", response.errors);

        let data = response.data.into_json().expect("response data should be valid json");
        assert_eq!(
            data,
            serde_json::json!({
                "GetAllowedDomains": [
                    { "domain": "example.com", "hasActiveUsers": false },
                    { "domain": "school.edu", "hasActiveUsers": true }
                ]
            })
        );
    }
}
