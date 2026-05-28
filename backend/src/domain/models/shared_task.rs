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

/// Un compañero candidato a recibir una tarea compartida. Los flags
/// `already_invited` y `already_has_copy` permiten que el cliente muestre el
/// candidato deshabilitado con un mensaje genérico sin revelar quién lo invitó.
#[derive(Clone, Debug)]
pub struct ShareCandidate {
    pub user_id: Uuid,
    pub username: String,
    pub full_name: String,
    pub role: String,
    /// `true` si el candidato tiene una invitación PENDING al `shared_task_id`
    /// consultado. Solo aplica cuando el cliente pide candidatos en el contexto
    /// de un reenvío (tarea ya existente).
    pub already_invited: bool,
    /// `true` si el candidato ya está vinculado (ACCEPTED + sub_state ∈
    /// {OPEN, COMPLETED, DISMISSED_DONE}) al `shared_task_id` consultado.
    pub already_has_copy: bool,
}

/// Sub-estado de una copia compartida. Solo es relevante cuando
/// `shared_task_recipients.status = 'ACCEPTED'`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SubState {
    Open,
    Completed,
    DismissedDone,
    Unlinked,
}

impl SubState {
    pub fn as_str(&self) -> &'static str {
        match self {
            SubState::Open => "OPEN",
            SubState::Completed => "COMPLETED",
            SubState::DismissedDone => "DISMISSED_DONE",
            SubState::Unlinked => "UNLINKED",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw {
            "OPEN" => Some(SubState::Open),
            "COMPLETED" => Some(SubState::Completed),
            "DISMISSED_DONE" => Some(SubState::DismissedDone),
            "UNLINKED" => Some(SubState::Unlinked),
            _ => None,
        }
    }
}

/// Elemento de la bandeja de entrada: una tarea que me compartieron.
/// El invitador puede no ser el dueño original (modelo viral).
#[derive(Clone, Debug)]
pub struct InboxItem {
    pub shared_task: SharedTask,
    pub status: String,
    pub sub_state: String,
    pub owner_username: String,
    pub owner_full_name: String,
    pub inviter_user_id: Option<Uuid>,
    pub inviter_username: Option<String>,
    pub inviter_full_name: Option<String>,
}

/// Estado de un destinatario concreto de una tarea que yo compartí.
#[derive(Clone, Debug)]
pub struct RecipientStatus {
    pub user_id: Uuid,
    pub username: String,
    pub full_name: String,
    pub status: String,
    pub sub_state: String,
    pub reminders_sent_24h: i64,
    /// No nulo cuando el destinatario marcó completada su copia local.
    pub completed_at: Option<DateTime<Utc>>,
    /// No nulo cuando el destinatario archivó la entrada de su inbox.
    pub archived_by_recipient_at: Option<DateTime<Utc>>,
    /// Quién envió esta invitación específica (modelo viral). Puede no ser
    /// el dueño original.
    pub inviter_user_id: Option<Uuid>,
}

/// Participante visible para enviar toques sobre una tarea compartida. En el
/// modelo viral aparecen TODOS los vinculados (PENDING + ACCEPTED + cerrados)
/// excepto el solicitante; el cliente decide el estado del botón según
/// `status` y `sub_state`.
#[derive(Clone, Debug)]
pub struct Participant {
    pub user_id: Uuid,
    pub username: String,
    pub full_name: String,
    /// "OWNER" o "RECIPIENT".
    pub role: String,
    /// "OWNER", "PENDING", "ACCEPTED" o "REJECTED".
    pub status: String,
    /// Sub-estado de su copia: OPEN, COMPLETED, DISMISSED_DONE, UNLINKED.
    pub sub_state: String,
    pub completed: bool,
    /// Recordatorios que el solicitante ya envió a este participante en 24 h.
    pub reminders_sent_24h: i64,
    /// Quién invitó a este participante (puede no ser el dueño).
    pub inviter_user_id: Option<Uuid>,
}

/// Resultado de reenviar (o crear) un share a varios candidatos. Permite que
/// el cliente diferencie cuántos fueron invitados y cuántos cayeron bajo
/// anti-duplicado, mostrando "Ya recibió una invitación" / "Ya tiene una copia".
#[derive(Clone, Debug, Default)]
pub struct ForwardResult {
    pub invited: Vec<Uuid>,
    pub already_invited: Vec<Uuid>,
    pub already_has_copy: Vec<Uuid>,
}

/// Filtro de la query unificada `MySharedTasks`: tab Invitaciones (PENDING que
/// recibí) o tab Vinculadas (lo que tengo en mi listado, sea por aceptar o por
/// crear).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MySharedTasksFilter {
    Invitations,
    Linked,
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
