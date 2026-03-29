use std::fmt::{Display, Formatter};

#[derive(Debug, Clone)]
pub enum DomainError {
    NotFound(String),
    Conflict(String),
    BadRequest(String),
    Unauthorized(String),
    Internal(String),
}

impl DomainError {
    pub fn msg(&self) -> String {
        match self {
            Self::NotFound(v)
            | Self::Conflict(v)
            | Self::BadRequest(v)
            | Self::Unauthorized(v)
            | Self::Internal(v) => v.clone(),
        }
    }
}

impl Display for DomainError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.msg())
    }
}

impl std::error::Error for DomainError {}
