use async_graphql::SimpleObject;

use crate::domain::models::shared_task::{
    ForwardResult, InboxItem, NotificationEvent, OutboxItem, Participant, RecipientStatus,
    ShareCandidate,
};

/// Compañero candidato a recibir una tarea compartida. Los flags
/// `already_invited` y `already_has_copy` se calculan cuando el cliente pide
/// candidatos con un `sharedTaskId` (contexto de reenvío); fuera de ese
/// contexto siempre vienen en `false`.
#[derive(SimpleObject, Clone)]
pub struct ShareCandidateType {
    pub user_id: String,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub already_invited: bool,
    pub already_has_copy: bool,
}

impl From<ShareCandidate> for ShareCandidateType {
    fn from(v: ShareCandidate) -> Self {
        Self {
            user_id: v.user_id.to_string(),
            username: v.username,
            full_name: v.full_name,
            role: v.role,
            already_invited: v.already_invited,
            already_has_copy: v.already_has_copy,
        }
    }
}

/// Resultado de un `ShareTask` (creación) o `ForwardSharedTask` (reenvío).
/// Permite al cliente diferenciar a quién se invitó y a quién no por
/// anti-duplicado, mostrando mensajes genéricos sin revelar el inviter.
#[derive(SimpleObject, Clone)]
pub struct ForwardSharedTaskResultType {
    pub shared_task_id: String,
    pub invited: Vec<String>,
    pub already_invited: Vec<String>,
    pub already_has_copy: Vec<String>,
}

impl ForwardSharedTaskResultType {
    pub fn from_forward(shared_task_id: String, v: ForwardResult) -> Self {
        Self {
            shared_task_id,
            invited: v.invited.into_iter().map(|i| i.to_string()).collect(),
            already_invited: v.already_invited.into_iter().map(|i| i.to_string()).collect(),
            already_has_copy: v.already_has_copy.into_iter().map(|i| i.to_string()).collect(),
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
    /// Sub-estado de mi copia: OPEN | COMPLETED | DISMISSED_DONE | UNLINKED.
    pub sub_state: String,
    pub owner_user_id: String,
    pub owner_username: String,
    pub owner_full_name: String,
    /// Inviter directo de esta invitación (puede ser un participante distinto
    /// al dueño en el modelo viral). `None` si el inviter quedó nulificado.
    pub inviter_user_id: Option<String>,
    pub inviter_username: Option<String>,
    pub inviter_full_name: Option<String>,
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
            sub_state: v.sub_state,
            owner_user_id: v.shared_task.owner_user_id.to_string(),
            owner_username: v.owner_username,
            owner_full_name: v.owner_full_name,
            inviter_user_id: v.inviter_user_id.map(|id| id.to_string()),
            inviter_username: v.inviter_username,
            inviter_full_name: v.inviter_full_name,
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
    /// Sub-estado de su copia: OPEN | COMPLETED | DISMISSED_DONE | UNLINKED.
    pub sub_state: String,
    /// Quién envió esta invitación (modelo viral). `None` si quedó nulificado.
    pub inviter_user_id: Option<String>,
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
            sub_state: v.sub_state,
            inviter_user_id: v.inviter_user_id.map(|id| id.to_string()),
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

/// Participante de una tarea compartida (dueño o destinatario aceptado).
/// Se usa para listar a quién puedo enviar toques desde cualquiera de los
/// lados (dueño o receptor).
#[derive(SimpleObject, Clone)]
pub struct SharedTaskParticipantType {
    pub user_id: String,
    pub username: String,
    pub full_name: String,
    /// "OWNER" o "RECIPIENT".
    pub role: String,
    /// Estado del destinatario ("ACCEPTED") u "OWNER" si es el dueño.
    pub status: String,
    /// Sub-estado de su copia (solo aplica a RECIPIENT). Para OWNER es "OWNER".
    pub sub_state: String,
    /// Inviter directo de la fila del participante (modelo viral).
    pub inviter_user_id: Option<String>,
    pub completed: bool,
    /// Recordatorios que el solicitante ya envió a este participante en 24 h.
    pub reminders_sent24h: i64,
}

impl From<Participant> for SharedTaskParticipantType {
    fn from(v: Participant) -> Self {
        Self {
            user_id: v.user_id.to_string(),
            username: v.username,
            full_name: v.full_name,
            role: v.role,
            status: v.status,
            sub_state: v.sub_state,
            inviter_user_id: v.inviter_user_id.map(|id| id.to_string()),
            completed: v.completed,
            reminders_sent24h: v.reminders_sent_24h,
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
