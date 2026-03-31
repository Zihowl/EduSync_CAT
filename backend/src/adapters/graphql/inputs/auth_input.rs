use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct LoginInput {
    pub email: String,
    pub password: String,
}
