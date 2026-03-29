#[derive(Clone, Debug)]
pub struct Classroom {
    pub id: i32,
    pub name: String,
    pub building_id: Option<i32>,
}
