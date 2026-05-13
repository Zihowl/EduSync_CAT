use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct LoginInput {
    pub email: String,
    pub password: String,
}

#[derive(InputObject, Clone)]
pub struct RegisterInput {
    pub email: String,
    pub password: String,
    pub password_confirmation: String,
}

#[derive(InputObject, Clone)]
pub struct VerifyEmailInput {
    pub verification_token: String,
    pub code: String,
}

#[derive(InputObject, Clone)]
pub struct ChangeCredentialsInput {
    pub current_email: String,
    pub current_password: String,
    pub new_email: String,
    pub new_password: String,
}
