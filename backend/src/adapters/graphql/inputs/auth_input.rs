use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct LoginInput {
    pub email: String,
    pub password: String,
}

#[derive(InputObject, Clone)]
pub struct ChangeCredentialsInput {
    pub current_email: String,
    pub current_password: String,
    pub new_email: String,
    pub new_password: String,
}
