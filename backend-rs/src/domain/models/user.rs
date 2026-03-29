use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum UserRole {
    SUPER_ADMIN,
    ADMIN_HORARIOS,
}

impl UserRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SUPER_ADMIN => "SUPER_ADMIN",
            Self::ADMIN_HORARIOS => "ADMIN_HORARIOS",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "SUPER_ADMIN" => Self::SUPER_ADMIN,
            _ => Self::ADMIN_HORARIOS,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub full_name: Option<String>,
    pub password_hash: String,
    pub role: UserRole,
    pub is_active: bool,
    pub is_temp_password: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
