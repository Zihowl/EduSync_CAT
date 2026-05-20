use async_graphql::InputObject;

/// Datos para subir o reemplazar un archivo adjunto cifrado (RQNF-APP-46/47).
#[derive(InputObject, Clone)]
pub struct UploadFileInput {
    /// uuid estable del archivo, generado por el cliente.
    pub file_uuid: String,
    /// Binario del archivo cifrado con AES-256 (base64).
    pub ciphertext: String,
    /// Nombre original del archivo, cifrado por el cliente.
    pub file_name: String,
    /// Tamaño del archivo original en bytes.
    pub file_size: i64,
}
