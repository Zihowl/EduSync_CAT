use async_graphql::SimpleObject;

use crate::domain::models::user_file::UserFile;

/// Archivo adjunto cifrado del usuario expuesto vía GraphQL. `ciphertext` es
/// el binario del archivo cifrado en el dispositivo: el servidor no lo lee.
#[derive(SimpleObject, Clone)]
pub struct UserFileType {
    pub file_uuid: String,
    pub ciphertext: String,
    pub file_name: String,
    pub file_size: i64,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    pub deleted_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<UserFile> for UserFileType {
    fn from(v: UserFile) -> Self {
        Self {
            file_uuid: v.file_uuid,
            ciphertext: v.ciphertext,
            file_name: v.file_name,
            file_size: v.file_size,
            updated_at: v.updated_at,
            deleted_at: v.deleted_at,
        }
    }
}
