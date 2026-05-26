use async_graphql::SimpleObject;

use crate::domain::models::shared_task::{
    InboxItem, NotificationEvent, OutboxItem, RecipientStatus, ShareCandidate,
};

/// Compañero candidato a recibir una tarea compartida.
#[derive(SimpleObject, Clone)]
pub struct ShareCandidateType {
    pub user_id: String,
    pub username: String,
    pub full_name: String,
    pub role: String,
}

impl From<ShareCandidate> for ShareCandidateType {
    fn from(v: ShareCandidate) -> Self {
        Self {
            user_id: v.user_id.to_string(),
            username: v.username,
            full_name: v.full_name,
            role: v.role,
        }
    }
}

/// Tarea compartida recibida (bandeja de entrada). Incluye el contenido
/// cifrado y la clave para que el cliente pueda descifrarla al aceptar.
#[derive(SimpleObject, Clone)]
pub struct SharedTaskInboxItemType {
    pub shared_task_id: String,
    pub ciphertext: String,
    pub enc_key: String,
    pub scope: String,
    pub title_preview: String,
    pub status: String,
    pub owner_username: String,
    pub owner_full_name: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl From<InboxItem> for SharedTaskInboxItemType {
    fn from(v: InboxItem) -> Self {
        Self {
            shared_task_id: v.shared_task.id.to_string(),
            ciphertext: v.shared_task.ciphertext,
            enc_key: v.shared_task.enc_key,
            scope: v.shared_task.scope,
            title_preview: v.shared_task.title_preview,
            status: v.status,
            owner_username: v.owner_username,
            owner_full_name: v.owner_full_name,
            created_at: v.shared_task.created_at,
        }
    }
}

/// Estado de un destinatario de una tarea que yo compartí.
#[derive(SimpleObject, Clone)]
pub struct SharedTaskRecipientStatusType {
    pub user_id: String,
    pub username: String,
    pub full_name: String,
    pub status: String,
    /// Recordatorios enviados a este compañero en las últimas 24 h.
    pub reminders_sent24h: i64,
    /// `true` cuando el destinatario marcó completada su copia local.
    pub completed: bool,
    /// `true` cuando el destinatario archivó la tarea en su inbox.
    pub archived_by_recipient: bool,
}

impl From<RecipientStatus> for SharedTaskRecipientStatusType {
    fn from(v: RecipientStatus) -> Self {
        Self {
            user_id: v.user_id.to_string(),
            username: v.username,
            full_name: v.full_name,
            status: v.status,
            reminders_sent24h: v.reminders_sent_24h,
            completed: v.completed_at.is_some(),
            archived_by_recipient: v.archived_by_recipient_at.is_some(),
        }
    }
}

/// Tarea compartida por mí (bandeja de salida) con el estado de cada
/// destinatario.
#[derive(SimpleObject, Clone)]
pub struct SharedTaskOutboxItemType {
    pub shared_task_id: String,
    pub scope: String,
    pub title_preview: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub recipients: Vec<SharedTaskRecipientStatusType>,
}

impl From<OutboxItem> for SharedTaskOutboxItemType {
    fn from(v: OutboxItem) -> Self {
        Self {
            shared_task_id: v.shared_task.id.to_string(),
            scope: v.shared_task.scope,
            title_preview: v.shared_task.title_preview,
            created_at: v.shared_task.created_at,
            recipients: v.recipients.into_iter().map(Into::into).collect(),
        }
    }
}

/// Resultado de compartir una tarea.
#[derive(SimpleObject, Clone)]
pub struct ShareTaskResultType {
    pub shared_task_id: String,
    pub recipient_count: i32,
}

/// Resultado de aceptar/rechazar una tarea compartida. Cuando se acepta,
/// `ciphertext`/`encKey` permiten al cliente crear su copia local.
#[derive(SimpleObject, Clone)]
pub struct RespondSharedTaskResultType {
    pub accepted: bool,
    pub ciphertext: Option<String>,
    pub enc_key: Option<String>,
}

/// Resultado de enviar un recordatorio: recordatorios restantes en 24 h.
#[derive(SimpleObject, Clone)]
pub struct SendTaskReminderResultType {
    pub remaining: i64,
}

/// Evento durable de notificación (TASK_SHARED/ACCEPTED/REJECTED/REMINDER/COMPLETED).
/// Lo consume el cliente al volver al foreground si FCM no entregó el push.
#[derive(SimpleObject, Clone)]
pub struct NotificationEventType {
    pub id: String,
    pub event_type: String,
    pub shared_task_id: Option<String>,
    pub actor_user_id: Option<String>,
    pub actor_username: Option<String>,
    pub actor_full_name: Option<String>,
    pub title_preview: Option<String>,
    pub payload_json: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub acked: bool,
}

impl From<NotificationEvent> for NotificationEventType {
    fn from(v: NotificationEvent) -> Self {
        Self {
            id: v.id.to_string(),
            event_type: v.event_type,
            shared_task_id: v.shared_task_id.map(|id| id.to_string()),
            actor_user_id: v.actor_user_id.map(|id| id.to_string()),
            actor_username: v.actor_username,
            actor_full_name: v.actor_full_name,
            title_preview: v.title_preview,
            payload_json: v.payload_json,
            created_at: v.created_at,
            acked: v.ack_at.is_some(),
        }
    }
}
