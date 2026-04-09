use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::domain::errors::DomainError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    pub email: String,
    pub role: String,
    pub exp: i64,
}

#[allow(dead_code)]
pub fn encode_jwt(claims: &JwtClaims, secret: &str) -> Result<String, DomainError> {
    encode(
        &Header::default(),
        claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| DomainError::Internal(format!("Error al codificar JWT: {e}")))
}

pub fn decode_jwt(token: &str, secret: &str) -> Result<JwtClaims, DomainError> {
    decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|d| d.claims)
    .map_err(|_| DomainError::Unauthorized("Token inválido".to_string()))
}
