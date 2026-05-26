use chrono::{DateTime, Utc};
use uuid::Uuid;

/// Perfil académico de un usuario: grupo y subgrupo a los que está suscrito.
/// Es la base para derivar la lista de compañeros candidatos a compartir.
#[derive(Clone, Debug)]
pub struct AcademicProfile {
    pub user_id: Uuid,
    pub group_id: Option<i32>,
    pub subgroup_id: Option<i32>,
}

/// Tarea compartida. El contenido (`ciphertext`) viaja cifrado con AES-256;
/// `enc_key` es la clave de esa tarea, entregada solo a usuarios autorizados.
#[derive(Clone, Debug)]
pub struct SharedTask {
    pub id: Uuid,
    pub owner_user_id: Uuid,
    pub ciphertext: String,
    pub enc_key: String,
    pub scope: String,
    pub title_preview: String,
    pub created_at: DateTime<Utc>,
}

/// Un compañero candidato a recibir una tarea compartida.
#[derive(Clone, Debug)]
pub struct ShareCandidate {
    pub user_id: Uuid,
    pub username: String,
    pub full_name: String,
    pub role: String,
}

/// Elemento de la bandeja de entrada: una tarea que me compartieron.
#[derive(Clone, Debug)]
pub struct InboxItem {
    pub shared_task: SharedTask,
    pub status: String,
    pub owner_username: String,
    pub owner_full_name: String,
}

/// Estado de un destinatario concreto de una tarea que yo compartí.
#[derive(Clone, Debug)]
pub struct RecipientStatus {
    pub user_id: Uuid,
    pub username: String,
    pub full_name: String,
    pub status: String,
    pub reminders_sent_24h: i64,
    /// No nulo cuando el destinatario marcó completada su copia local.
    pub completed_at: Option<DateTime<Utc>>,
    /// No nulo cuando el destinatario archivó la entrada de su inbox.
    pub archived_by_recipient_at: Option<DateTime<Utc>>,
}

/// Elemento de la bandeja de salida: una tarea que yo compartí.
#[derive(Clone, Debug)]
pub struct OutboxItem {
    pub shared_task: SharedTask,
    pub recipients: Vec<RecipientStatus>,
}

/// Evento durable en `notification_events`. Lo usa el cliente para sincronizar
/// la bandeja al volver al foreground cuando FCM falló.
#[derive(Clone, Debug)]
pub struct NotificationEvent {
    pub id: Uuid,
    pub recipient_id: Uuid,
    pub event_type: String,
    pub shared_task_id: Option<Uuid>,
    pub actor_user_id: Option<Uuid>,
    pub actor_username: Option<String>,
    pub actor_full_name: Option<String>,
    pub title_preview: Option<String>,
    pub payload_json: String,
    pub created_at: DateTime<Utc>,
    pub ack_at: Option<DateTime<Utc>>,
}
