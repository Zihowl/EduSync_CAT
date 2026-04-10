use async_graphql::{SimpleObject, ID};

use crate::domain::models::allowed_domain::{AllowedDomain, AllowedDomainWithUsage};

#[derive(SimpleObject, Clone)]
pub struct AllowedDomainType {
    pub id: ID,
    pub domain: String,
    pub has_active_users: bool,
}

impl From<AllowedDomain> for AllowedDomainType {
    fn from(v: AllowedDomain) -> Self {
        Self {
            id: ID(v.id.to_string()),
            domain: v.domain,
            has_active_users: false,
        }
    }
}

impl From<AllowedDomainWithUsage> for AllowedDomainType {
    fn from(v: AllowedDomainWithUsage) -> Self {
        Self {
            id: ID(v.id.to_string()),
            domain: v.domain,
            has_active_users: v.has_active_users,
        }
    }
}
