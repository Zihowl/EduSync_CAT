use async_graphql::{ID, SimpleObject};

use crate::domain::models::user::User;

#[derive(SimpleObject, Clone)]
pub struct UserType {
    pub id: ID,
    pub email: String,
    pub full_name: Option<String>,
    pub role: String,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<User> for UserType {
    fn from(v: User) -> Self {
        Self {
            id: ID(v.id.to_string()),
            email: v.email,
            full_name: v.full_name,
            role: v.role.as_str().to_string(),
            is_active: v.is_active,
            created_at: v.created_at,
            updated_at: v.updated_at,
        }
    }
}
