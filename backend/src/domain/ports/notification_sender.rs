use async_trait::async_trait;
use serde_json::Value;

/// Mensaje push de la colaboración de tareas. Es **data-only** (sin
/// `notification`) para que el cliente Android decida cómo mostrarlo y poder
/// hacer refreshes silenciosos al recibirlo.
#[derive(Clone, Debug)]
pub struct PushMessage {
    /// Token FCM del dispositivo destinatario.
    pub token: String,
    /// Tipo de evento: `TASK_SHARED`, `TASK_ACCEPTED`, `TASK_REJECTED`,
    /// `TASK_REMINDER`, `TASK_COMPLETED`.
    pub event_type: String,
    /// Payload adicional (sharedTaskId, titulares, etc.). Solo strings.
    pub data: Value,
}

/// Puerto para enviar pushes. Implementación productiva: `FcmSender` (FCM
/// HTTP v1). Se inyecta como `Arc<dyn NotificationSender>` y los errores no
/// bloquean al servicio: la durabilidad la da `notification_events`.
#[async_trait]
pub trait NotificationSender: Send + Sync {
    /// Envía un push. Si el token es inválido devuelve `Ok(false)` para que
    /// el llamador lo elimine de `device_tokens`.
    async fn send(&self, message: PushMessage) -> Result<bool, NotificationError>;
}

#[derive(Debug, thiserror::Error)]
pub enum NotificationError {
    #[error("token de dispositivo inválido")]
    InvalidToken,
    #[error("error de transporte: {0}")]
    Transport(String),
    #[error("error de autenticación con FCM: {0}")]
    Auth(String),
    #[error("error del servidor FCM: {0}")]
    Server(String),
}
