use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Respaldo cifrado de los datos personales de un usuario de la app DOG.
/// `ciphertext` es texto cifrado en el dispositivo; el servidor nunca lo lee.
#[derive(Clone, Debug)]
pub struct UserBackup {
    pub user_id: Uuid,
    pub ciphertext: String,
    pub updated_at: DateTime<Utc>,
}
