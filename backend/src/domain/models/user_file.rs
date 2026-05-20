use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Archivo adjunto cifrado de una nota de la app DOG. `ciphertext` es el
/// binario del archivo cifrado en el dispositivo (base64); el servidor nunca
/// lo lee. `deleted_at` no nulo marca un archivo borrado (tombstone) para que
/// el borrado se propague a los demás dispositivos.
#[derive(Clone, Debug)]
pub struct UserFile {
    pub user_id: Uuid,
    pub file_uuid: String,
    pub ciphertext: String,
    pub file_name: String,
    pub file_size: i64,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}
