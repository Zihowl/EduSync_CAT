use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct CreateGroupInput {
    pub name: String,
    pub parent_id: Option<i32>,
}

#[derive(InputObject, Clone)]
pub struct UpdateGroupInput {
    pub id: i32,
    pub name: Option<String>,
    pub parent_id: Option<i32>,
}
