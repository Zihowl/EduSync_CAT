use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct CreateBuildingInput {
    pub name: String,
    pub description: Option<String>,
}

#[derive(InputObject, Clone)]
pub struct UpdateBuildingInput {
    pub id: i32,
    pub name: Option<String>,
    pub description: Option<String>,
}
