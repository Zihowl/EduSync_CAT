use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct CreateSubjectInput {
    pub code: String,
    pub name: String,
}

#[derive(InputObject, Clone)]
pub struct UpdateSubjectInput {
    pub id: i32,
    pub code: Option<String>,
    pub name: Option<String>,
}
