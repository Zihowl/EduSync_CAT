use async_graphql::{ID, SimpleObject};

use crate::domain::models::allowed_domain::AllowedDomain;

#[derive(SimpleObject, Clone)]
pub struct AllowedDomainType {
    pub id: ID,
    pub domain: String,
}

impl From<AllowedDomain> for AllowedDomainType {
    fn from(v: AllowedDomain) -> Self {
        Self {
            id: ID(v.id.to_string()),
            domain: v.domain,
        }
    }
}
