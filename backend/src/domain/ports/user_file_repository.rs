use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::{errors::DomainError, models::user_file::UserFile};

#[async_trait]
pub trait UserFileRepository: Send + Sync {
    /// Crea o reemplaza un archivo cifrado del usuario, identificado por
    /// `file_uuid`. Reactiva el archivo (limpia el tombstone).
    async fn upsert(
        &self,
        user_id: Uuid,
        file_uuid: &str,
        ciphertext: &str,
        file_name: &str,
        file_size: i64,
    ) -> Result<UserFile, DomainError>;

    /// Marca un archivo como borrado (tombstone). Devuelve `false` si no existía.
    async fn soft_delete(&self, user_id: Uuid, file_uuid: &str)
        -> Result<bool, DomainError>;

    /// Lista todos los archivos del usuario, incluidos los tombstones, para
    /// que el cliente pueda propagar los borrados.
    async fn list_for_user(&self, user_id: Uuid) -> Result<Vec<UserFile>, DomainError>;

    /// Obtiene un archivo concreto del usuario (descarga on-demand).
    async fn find(
        &self,
        user_id: Uuid,
        file_uuid: &str,
    ) -> Result<Option<UserFile>, DomainError>;
}
