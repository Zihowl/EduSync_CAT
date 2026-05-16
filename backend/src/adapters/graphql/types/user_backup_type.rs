use async_graphql::SimpleObject;

use crate::domain::models::user_backup::UserBackup;

/// Respaldo cifrado del usuario expuesto vía GraphQL. `ciphertext` es
/// texto cifrado en el dispositivo: el servidor no puede leer su contenido.
#[derive(SimpleObject, Clone)]
pub struct UserBackupType {
    pub ciphertext: String,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<UserBackup> for UserBackupType {
    fn from(v: UserBackup) -> Self {
        Self {
            ciphertext: v.ciphertext,
            updated_at: v.updated_at,
        }
    }
}
