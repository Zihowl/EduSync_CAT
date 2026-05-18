use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::AuthUser,
        graphql::{
            inputs::auth_input::{
                ChangeCredentialsInput, CompletePasswordResetInput, LoginInput, LoginPlatform,
                RegisterInput, RequestPasswordResetInput, VerifyEmailInput, VerifyResetCodeInput,
            },
            schema::to_gql_error,
            types::{
                auth_types::{
                    LoginResponseType, PasswordResetResponseType, RegisterResponseType,
                    VerifyEmailResponseType,
                },
                user_type::UserType,
            },
        },
    },
    domain::{errors::DomainError, services::auth_service::AuthService},
};

#[derive(Default)]
pub struct AuthMutation;

#[Object]
impl AuthMutation {
    #[graphql(name = "Login")]
    async fn login(
        &self,
        ctx: &Context<'_>,
        login_input: LoginInput,
    ) -> async_graphql::Result<LoginResponseType> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        let user = svc
            .validate_user(&login_input.email, &login_input.password)
            .await
            .map_err(to_gql_error)?;

        // Restricción de acceso por plataforma: la web (CAT) es solo para
        // administradores; la app móvil (DOG) solo para alumnos/docentes.
        match login_input.platform {
            LoginPlatform::Web if !user.role.is_admin() => {
                return Err(to_gql_error(DomainError::Unauthorized(
                    "Esta cuenta no tiene acceso a la plataforma web. Usa la app móvil."
                        .to_string(),
                )));
            }
            LoginPlatform::Mobile if user.role.is_admin() => {
                return Err(to_gql_error(DomainError::Unauthorized(
                    "Las cuentas de administrador deben usar la plataforma web CAT."
                        .to_string(),
                )));
            }
            _ => {}
        }

        if user.is_temp_password {
            // Emite un token de un solo propósito para que el usuario pueda
            // cambiar sus credenciales sin reingresar la contraseña temporal.
            let res = svc
                .issue_credential_change_token(&user)
                .map_err(to_gql_error)?;
            return Ok(LoginResponseType {
                access_token: res.access_token,
                refresh_token: None,
                expires_in: res.expires_in,
                user: user.into(),
            });
        }

        let res = svc.login(user).map_err(to_gql_error)?;

        Ok(LoginResponseType {
            access_token: res.access_token,
            refresh_token: res.refresh_token,
            expires_in: res.expires_in,
            user: res.user.into(),
        })
    }

    #[graphql(name = "Register")]
    async fn register(
        &self,
        ctx: &Context<'_>,
        register_input: RegisterInput,
    ) -> async_graphql::Result<RegisterResponseType> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        let (token, expires_at) = svc
            .register(
                &register_input.email,
                &register_input.full_name,
                &register_input.username,
                &register_input.password,
                &register_input.password_confirmation,
            )
            .await
            .map_err(to_gql_error)?;
        Ok(RegisterResponseType {
            verification_token: token.to_string(),
            expires_at,
        })
    }

    #[graphql(name = "VerifyEmail")]
    async fn verify_email(
        &self,
        ctx: &Context<'_>,
        verify_input: VerifyEmailInput,
    ) -> async_graphql::Result<VerifyEmailResponseType> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        let res = svc
            .verify_email(&verify_input.verification_token, &verify_input.code)
            .await
            .map_err(to_gql_error)?;
        Ok(VerifyEmailResponseType {
            access_token: res.access_token,
            expires_in: res.expires_in,
            user: res.user.into(),
        })
    }

    #[graphql(name = "RequestPasswordReset")]
    async fn request_password_reset(
        &self,
        ctx: &Context<'_>,
        input: RequestPasswordResetInput,
    ) -> async_graphql::Result<PasswordResetResponseType> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        let (token, expires_at) = svc
            .request_password_reset(&input.email)
            .await
            .map_err(to_gql_error)?;
        Ok(PasswordResetResponseType {
            verification_token: token.to_string(),
            expires_at,
        })
    }

    #[graphql(name = "VerifyPasswordResetCode")]
    async fn verify_password_reset_code(
        &self,
        ctx: &Context<'_>,
        input: VerifyResetCodeInput,
    ) -> async_graphql::Result<bool> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        svc.verify_password_reset_code(&input.verification_token, &input.code)
            .await
            .map_err(to_gql_error)?;
        Ok(true)
    }

    #[graphql(name = "CompletePasswordReset")]
    async fn complete_password_reset(
        &self,
        ctx: &Context<'_>,
        input: CompletePasswordResetInput,
    ) -> async_graphql::Result<bool> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        svc.complete_password_reset(
            &input.verification_token,
            &input.new_password,
            &input.new_password_confirmation,
        )
        .await
        .map_err(to_gql_error)?;
        Ok(true)
    }

    /// Re-emite el token de sesión con el rol actual del usuario. La app lo
    /// invoca cuando detecta un cambio en el catálogo de docentes.
    #[graphql(name = "RefreshSession")]
    async fn refresh_session(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<LoginResponseType> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .cloned()
            .ok_or_else(|| to_gql_error(DomainError::Unauthorized("No autorizado".to_string())))?;
        if auth_user.is_credential_change_only() {
            return Err(to_gql_error(DomainError::Unauthorized(
                "No autorizado".to_string(),
            )));
        }
        let svc = ctx.data::<Arc<AuthService>>()?;
        let res = svc
            .refresh_session(auth_user.user_id)
            .await
            .map_err(to_gql_error)?;
        Ok(LoginResponseType {
            access_token: res.access_token,
            refresh_token: res.refresh_token,
            expires_in: res.expires_in,
            user: res.user.into(),
        })
    }

    #[graphql(name = "ChangeCredentials")]
    async fn change_credentials(
        &self,
        ctx: &Context<'_>,
        input: ChangeCredentialsInput,
    ) -> async_graphql::Result<UserType> {
        // Acepta tanto un token de sesión completa como el token acotado
        // `credential_change` emitido al iniciar sesión con contraseña temporal.
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .cloned()
            .ok_or_else(|| to_gql_error(DomainError::Unauthorized("No autorizado".to_string())))?;
        let svc = ctx.data::<Arc<AuthService>>()?;
        let user = svc
            .change_credentials(auth_user.user_id, &input.new_email, &input.new_password)
            .await
            .map_err(to_gql_error)?;

        Ok(user.into())
    }
}
