#[derive(Clone, Debug)]
pub struct Group {
    pub id: i32,
    pub name: String,
    pub parent_id: Option<i32>,
}
