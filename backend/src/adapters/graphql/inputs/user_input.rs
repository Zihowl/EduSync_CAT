use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct CreateAdminInput {
    pub email: String,
    pub full_name: String,
}
