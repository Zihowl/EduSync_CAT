#[derive(Clone, Debug)]
pub struct Subject {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub grade: Option<i32>,
    pub division: Option<String>,
}
