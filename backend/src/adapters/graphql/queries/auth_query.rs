use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::graphql::{schema::to_gql_error, types::auth_types::RegistrationProfileType},
    domain::services::auth_service::AuthService,
};

#[derive(Default)]
pub struct AuthQuery;

#[Object]
impl AuthQuery {
    /// Indica si un nombre de usuario está disponible para registrarse.
    /// Permite validación en vivo en el formulario de registro.
    #[graphql(name = "UsernameAvailable")]
    async fn username_available(
        &self,
        ctx: &Context<'_>,
        username: String,
    ) -> async_graphql::Result<bool> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        svc.username_available(&username)
            .await
            .map_err(to_gql_error)
    }

    /// Perfil de registro de un correo: detecta si pertenece a un docente del
    /// catálogo para autocompletar y bloquear el nombre en el formulario.
    #[graphql(name = "RegistrationProfile")]
    async fn registration_profile(
        &self,
        ctx: &Context<'_>,
        email: String,
    ) -> async_graphql::Result<RegistrationProfileType> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        let (is_teacher, suggested_full_name) = svc
            .registration_profile(&email)
            .await
            .map_err(to_gql_error)?;
        Ok(RegistrationProfileType {
            is_teacher,
            suggested_full_name,
        })
    }
}
