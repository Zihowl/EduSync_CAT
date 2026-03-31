use async_graphql::InputObject;

#[derive(InputObject, Clone)]
pub struct CreateTeacherInput {
    pub employee_number: String,
    pub name: String,
    pub email: Option<String>,
}

#[derive(InputObject, Clone)]
pub struct UpdateTeacherInput {
    pub id: i32,
    pub employee_number: Option<String>,
    pub name: Option<String>,
    pub email: Option<String>,
}
