use std::sync::Arc;

use async_graphql::{Context, Object};
use serde_json::json;

use crate::{
    adapters::{
        auth::middleware::require_super_admin,
        graphql::{
            audit::record_admin_audit,
            realtime::{publish_realtime_event, RealtimeScope},
            schema::to_gql_error,
            types::{allowed_domain_type::AllowedDomainType, school_year_type::SchoolYearType},
        },
    },
    domain::services::config_service::ConfigService,
};

#[derive(Default)]
pub struct ConfigMutation;

#[Object]
impl ConfigMutation {
    #[graphql(name = "CreateAllowedDomain")]
    async fn create_allowed_domain(
        &self,
        ctx: &Context<'_>,
        domain: String,
    ) -> async_graphql::Result<AllowedDomainType> {
        let auth_user = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        let result: async_graphql::Result<AllowedDomainType> = svc
            .create_domain(&domain)
            .await
            .map_err(to_gql_error)
            .map(AllowedDomainType::from);
        if result.is_ok() {
            if let Ok(created_domain) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "create_allowed_domain",
                    "allowed_domain",
                    Some(created_domain.id.to_string()),
                    json!({
                        "domain": created_domain.domain
                    }),
                )
                .await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::AllowedDomains, RealtimeScope::Users]);
        }
        result
    }

    #[graphql(name = "RemoveAllowedDomain")]
    async fn remove_allowed_domain(
        &self,
        ctx: &Context<'_>,
        id: i32,
    ) -> async_graphql::Result<bool> {
        let auth_user = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        let result = svc.remove_domain(id).await.map_err(to_gql_error);
        if result.is_ok() {
            record_admin_audit(
                ctx,
                &auth_user,
                "remove_allowed_domain",
                "allowed_domain",
                Some(id.to_string()),
                json!({
                    "domain_id": id
                }),
            )
            .await;

            publish_realtime_event(ctx, &[RealtimeScope::AllowedDomains, RealtimeScope::Users]);
        }
        result
    }

    #[graphql(name = "SetCurrentSchoolYear")]
    async fn set_current_school_year(
        &self,
        ctx: &Context<'_>,
        start_date: String,
        end_date: String,
    ) -> async_graphql::Result<SchoolYearType> {
        let auth_user = require_super_admin(ctx)?;
        let svc = ctx.data::<Arc<ConfigService>>()?;
        let result: async_graphql::Result<SchoolYearType> = svc
            .set_current_school_year(&start_date, &end_date)
            .await
            .map(SchoolYearType::from)
            .map_err(to_gql_error);
        if result.is_ok() {
            if let Ok(school_year) = &result {
                record_admin_audit(
                    ctx,
                    &auth_user,
                    "set_current_school_year",
                    "school_year",
                    Some(school_year.id.to_string()),
                    json!({
                        "start_date": start_date,
                        "end_date": end_date
                    }),
                )
                .await;
            }

            publish_realtime_event(ctx, &[RealtimeScope::CurrentSchoolYear]);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::sync::{Arc, Mutex};

    use async_graphql::{EmptySubscription, Request, Schema};
    use async_trait::async_trait;
    use chrono::Utc;
    use uuid::Uuid;

    use crate::{
        adapters::auth::middleware::AuthUser,
        adapters::graphql::queries::config_query::ConfigQuery,
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

    fn build_schema() -> Schema<ConfigQuery, ConfigMutation, EmptySubscription> {
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
        let user_repo = Arc::new(MockUserRepository::new(vec![sample_user("active.teacher@school.edu", true)]));
        let school_year_repo = Arc::new(MockSchoolYearRepository::new(None));
        let service = Arc::new(ConfigService::new(domain_repo, user_repo, school_year_repo));

        Schema::build(
            ConfigQuery::default(),
            ConfigMutation::default(),
            EmptySubscription,
        )
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
    async fn config_mutations_require_super_admin() {
        let schema = build_schema();
        let admin = auth_user("ADMIN_HORARIOS");
        let super_admin = auth_user("SUPER_ADMIN");

        let mutation_cases = [
            "mutation { CreateAllowedDomain(domain: \"fresh-domain.edu\") { id domain hasActiveUsers } }",
            "mutation { RemoveAllowedDomain(id: 1) }",
            "mutation { SetCurrentSchoolYear(startDate: \"2026-08-01\", endDate: \"2027-07-31\") { id startDate endDate createdAt } }",
        ];

        for mutation in mutation_cases {
            let response = schema.execute(Request::new(mutation)).await;
            assert_no_authorization_error(&response);

            let response = schema
                .execute(Request::new(mutation).data(admin.clone()))
                .await;
            assert_access_denied_error(&response);

            let response = schema
                .execute(Request::new(mutation).data(super_admin.clone()))
                .await;
            assert!(
                response.errors.is_empty(),
                "unexpected errors: {:?}",
                response.errors
            );
        }
    }

    #[tokio::test]
    async fn remove_allowed_domain_is_blocked_when_active_users_exist() {
        let schema = build_schema();
        let super_admin = auth_user("SUPER_ADMIN");

        let response = schema
            .execute(Request::new("mutation { RemoveAllowedDomain(id: 2) }").data(super_admin))
            .await;

        assert!(
            response
                .errors
                .iter()
                .any(|error| error.message == "No se puede eliminar el dominio porque existen usuarios activos asociados"),
            "unexpected errors: {:?}",
            response.errors
        );
    }
}
