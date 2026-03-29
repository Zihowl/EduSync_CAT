#[derive(Clone, Debug)]
pub struct Teacher {
    pub id: i32,
    pub employee_number: String,
    pub name: String,
    pub email: Option<String>,
}
