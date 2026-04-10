#[derive(Clone, Debug)]
pub struct AllowedDomain {
    pub id: i32,
    pub domain: String,
}

#[derive(Clone, Debug)]
pub struct AllowedDomainWithUsage {
    pub id: i32,
    pub domain: String,
    pub has_active_users: bool,
}
