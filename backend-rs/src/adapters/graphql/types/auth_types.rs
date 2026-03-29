use async_graphql::SimpleObject;

use super::user_type::UserType;

#[derive(SimpleObject, Clone)]
pub struct LoginResponseType {
    pub access_token: String,
    pub user: UserType,
}
