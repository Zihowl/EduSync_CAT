use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::graphql::{
        inputs::auth_input::{ChangeCredentialsInput, LoginInput},
        schema::to_gql_error,
        types::{auth_types::LoginResponseType, user_type::UserType},
    },
    domain::services::auth_service::AuthService,
};

#[derive(Default)]
pub struct AuthMutation;

#[Object]
impl AuthMutation {
    #[graphql(name = "Login")]
    async fn login(&self, ctx: &Context<'_>, login_input: LoginInput) -> async_graphql::Result<LoginResponseType> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        let user = svc
            .validate_user(&login_input.email, &login_input.password)
            .await
            .map_err(to_gql_error)?;
        let res = svc.login(user).map_err(to_gql_error)?;

        Ok(LoginResponseType {
            access_token: res.access_token,
            user: res.user.into(),
        })
    }

    #[graphql(name = "ChangeCredentials")]
    async fn change_credentials(&self, ctx: &Context<'_>, input: ChangeCredentialsInput) -> async_graphql::Result<UserType> {
        let svc = ctx.data::<Arc<AuthService>>()?;
        let user = svc
            .change_credentials(
                &input.current_email,
                &input.current_password,
                &input.new_email,
                &input.new_password,
            )
            .await
            .map_err(to_gql_error)?;

        Ok(user.into())
    }
}
