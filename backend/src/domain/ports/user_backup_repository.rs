use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::{errors::DomainError, models::user_backup::UserBackup};

#[async_trait]
pub trait UserBackupRepository: Send + Sync {
    /// Crea o reemplaza el respaldo cifrado del usuario.
    async fn upsert(&self, user_id: Uuid, ciphertext: &str)
        -> Result<UserBackup, DomainError>;

    /// Obtiene el respaldo del usuario, si existe.
    async fn find_by_user(&self, user_id: Uuid) -> Result<Option<UserBackup>, DomainError>;
}
