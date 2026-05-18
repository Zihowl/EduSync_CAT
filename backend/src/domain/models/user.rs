use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum UserRole {
    SuperAdmin,
    AdminHorarios,
    Student,
    Teacher,
}

impl UserRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SuperAdmin => "SUPER_ADMIN",
            Self::AdminHorarios => "ADMIN_HORARIOS",
            Self::Student => "STUDENT",
            Self::Teacher => "TEACHER",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "SUPER_ADMIN" => Self::SuperAdmin,
            "STUDENT" => Self::Student,
            "TEACHER" => Self::Teacher,
            _ => Self::AdminHorarios,
        }
    }

    /// `true` para roles administrativos (acceso a la plataforma web CAT),
    /// `false` para alumnos/docentes (acceso a la app móvil DOG).
    pub fn is_admin(&self) -> bool {
        matches!(self, Self::SuperAdmin | Self::AdminHorarios)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub full_name: String,
    pub password_hash: String,
    pub role: UserRole,
    pub is_active: bool,
    pub is_temp_password: bool,
    pub failed_login_attempts: i32,
    pub lockout_until: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
