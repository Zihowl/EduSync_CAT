use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct CreateClassroomInput {
    pub name: String,
    pub building_id: Option<i32>,
}

#[derive(InputObject, Clone)]
pub struct UpdateClassroomInput {
    pub id: i32,
    pub name: Option<String>,
    pub building_id: Option<i32>,
}
