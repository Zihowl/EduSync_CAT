use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::shared_task::{
        AcademicProfile, ForwardResult, InboxItem, MySharedTasksFilter, NotificationEvent,
        OutboxItem, Participant, ShareCandidate, SharedTask, SubState,
    },
};

/// Resumen mínimo de un destinatario, usado para emitir notificaciones tras
/// `share_task` sin re-consultar usuarios.
#[derive(Clone, Debug)]
pub struct RecipientSummary {
    pub user_id: Uuid,
    pub username: String,
    pub full_name: String,
}

/// Persistencia de la colaboración de tareas: perfil académico, tareas
/// compartidas, destinatarios y recordatorios (RQF-APP-45/46/47).
#[async_trait]
pub trait CollaborationRepository: Send + Sync {
    /// Crea o actualiza el grupo/subgrupo al que está suscrito el usuario.
    async fn upsert_academic_profile(
        &self,
        user_id: Uuid,
        group_id: Option<i32>,
        subgroup_id: Option<i32>,
    ) -> Result<(), DomainError>;

    async fn find_academic_profile(
        &self,
        user_id: Uuid,
    ) -> Result<Option<AcademicProfile>, DomainError>;

    /// Compañeros candidatos: alumnos/docentes que comparten el grupo raíz
    /// (árbol descendente de `groups.parent_id`) con el solicitante. Cuando se
    /// proporciona `shared_task_id`, se calculan `already_invited` y
    /// `already_has_copy` (sin revelar el inviter) para que el cliente muestre
    /// el candidato deshabilitado con un mensaje genérico al reenviar.
    async fn find_candidates(
        &self,
        exclude_user_id: Uuid,
        group_id: Option<i32>,
        subgroup_id: Option<i32>,
        search: Option<&str>,
        shared_task_id: Option<Uuid>,
    ) -> Result<Vec<ShareCandidate>, DomainError>;

    async fn create_shared_task(
        &self,
        owner_user_id: Uuid,
        ciphertext: &str,
        enc_key: &str,
        scope: &str,
        title_preview: &str,
        recipient_ids: &[Uuid],
    ) -> Result<SharedTask, DomainError>;

    /// Reenvía (o crea adicionalmente) invitaciones para una tarea ya existente.
    /// `forwarder_user_id` debe ser un participante ACCEPTED+OPEN o el dueño
    /// no-desvinculado. Aplica anti-duplicado por `(shared_task_id, recipient)`:
    /// si la fila previa está en PENDING o ACCEPTED+sub_state activo, se reporta
    /// como tal; si está en REJECTED o UNLINKED, se reescribe a PENDING con el
    /// nuevo `inviter_user_id`.
    async fn forward_share(
        &self,
        forwarder_user_id: Uuid,
        shared_task_id: Uuid,
        recipient_ids: &[Uuid],
    ) -> Result<ForwardResult, DomainError>;

    /// Desvincula al usuario de la tarea (marca su fila como
    /// `sub_state='UNLINKED'`). Si tras la desvinculación quedan <2
    /// participantes ACCEPTED+OPEN, cancela las invitaciones PENDING (devuelve
    /// los recipient_ids cancelados para que el servicio emita
    /// `INVITATION_CANCELED` durables).
    async fn unlink_recipient(
        &self,
        user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<Vec<Uuid>, DomainError>;

    /// El dueño borra su copia: setea `owner_unlinked_at`. Los receptores
    /// aceptados siguen vinculados entre sí. Aplica la misma regla de
    /// cancelación de huérfanas que `unlink_recipient`.
    async fn unlink_owner(
        &self,
        owner_user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<Vec<Uuid>, DomainError>;

    /// Cambia el sub-estado de la copia del usuario (OPEN/COMPLETED/DISMISSED_DONE).
    /// No se permite `UNLINKED` por esta vía (usa `unlink_recipient`).
    async fn mark_sub_state(
        &self,
        user_id: Uuid,
        shared_task_id: Uuid,
        sub_state: SubState,
    ) -> Result<Uuid, DomainError>;

    /// Cuenta participantes ACCEPTED + sub_state=OPEN sobre una tarea, sin
    /// considerar al `viewer` (útil para decidir si el cliente debe mostrar
    /// `badgeShared`: hay otros activos).
    async fn count_others_active(
        &self,
        shared_task_id: Uuid,
        viewer_user_id: Uuid,
    ) -> Result<i64, DomainError>;

    /// Listado unificado de "mis tareas compartidas": tab Invitaciones (PENDING
    /// recibidas) o tab Vinculadas (lo que tengo aceptado o creé como dueño).
    async fn find_my_shared_tasks(
        &self,
        user_id: Uuid,
        filter: MySharedTasksFilter,
    ) -> Result<Vec<InboxItem>, DomainError>;

    async fn find_shared_task(&self, id: Uuid) -> Result<Option<SharedTask>, DomainError>;

    /// Bandeja de entrada: tareas compartidas hacia `user_id`.
    async fn find_inbox(&self, user_id: Uuid) -> Result<Vec<InboxItem>, DomainError>;

    /// Bandeja de salida: tareas compartidas por `owner_user_id`.
    async fn find_outbox(&self, owner_user_id: Uuid) -> Result<Vec<OutboxItem>, DomainError>;

    /// Estado actual de un destinatario sobre una tarea; `None` si no aplica.
    async fn recipient_status(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<Option<String>, DomainError>;

    /// Inviter (quién envió la invitación específica) de la fila
    /// `(shared_task_id, recipient_user_id)`. Es `None` si la fila no existe o
    /// si el inviter quedó nulificado por `ON DELETE SET NULL`.
    async fn recipient_inviter(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<Option<Uuid>, DomainError>;

    /// Fija el estado de respuesta (`ACCEPTED`/`REJECTED`) de un destinatario.
    async fn set_recipient_status(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
        status: &str,
    ) -> Result<(), DomainError>;

    /// Recordatorios enviados por `sender` a `recipient` sobre la tarea en las
    /// últimas 24 horas (para imponer el límite de RQNF-APP-45).
    async fn count_reminders_last_24h(
        &self,
        shared_task_id: Uuid,
        sender_user_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<i64, DomainError>;

    async fn create_reminder(
        &self,
        shared_task_id: Uuid,
        sender_user_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<(), DomainError>;

    /// Lista todos los participantes de una tarea compartida con los que el
    /// solicitante puede interactuar (dueño + destinatarios `ACCEPTED`),
    /// excluyendo al propio solicitante. Devuelve también cuántos
    /// recordatorios envió el solicitante a cada uno en 24 h.
    async fn list_participants(
        &self,
        shared_task_id: Uuid,
        viewer_user_id: Uuid,
    ) -> Result<Vec<Participant>, DomainError>;

    // ----- Entrega + colaboración avanzada (009_collab_delivery) -----

    /// Marca o desmarca la copia local de un destinatario como completada.
    /// Devuelve el `owner_user_id` para que el servicio le notifique.
    async fn set_recipient_completed(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
        completed: bool,
    ) -> Result<Uuid, DomainError>;

    /// El destinatario archiva la entrada en su inbox.
    async fn archive_for_recipient(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<(), DomainError>;

    /// El owner archiva la tarea de su outbox.
    async fn archive_for_owner(
        &self,
        shared_task_id: Uuid,
        owner_user_id: Uuid,
    ) -> Result<(), DomainError>;

    /// Datos cortos de los destinatarios para emitir notificaciones tras
    /// `create_shared_task`.
    async fn recipient_summaries(
        &self,
        ids: &[Uuid],
    ) -> Result<Vec<RecipientSummary>, DomainError>;

    /// `True` si el destinatario ya completó su copia local.
    async fn recipient_has_completed(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<bool, DomainError>;

    /// Datos del actor (username/full_name) para enriquecer los payloads de
    /// notificación sin tocar `UserRepository`.
    async fn actor_identity(
        &self,
        user_id: Uuid,
    ) -> Result<Option<(String, String)>, DomainError>;

    // ----- Tokens FCM -----

    async fn register_device_token(
        &self,
        user_id: Uuid,
        token: &str,
        platform: &str,
    ) -> Result<(), DomainError>;

    async fn unregister_device_token(
        &self,
        user_id: Uuid,
        token: &str,
    ) -> Result<(), DomainError>;

    async fn tokens_for_user(&self, user_id: Uuid) -> Result<Vec<String>, DomainError>;

    /// Elimina un token concreto (usado cuando FCM devuelve UNREGISTERED).
    async fn drop_token(&self, token: &str) -> Result<(), DomainError>;

    // ----- Eventos durables -----

    async fn create_notification_event(
        &self,
        recipient_id: Uuid,
        event_type: &str,
        shared_task_id: Option<Uuid>,
        actor_user_id: Option<Uuid>,
        payload_json: &str,
    ) -> Result<Uuid, DomainError>;

    async fn find_notification_events(
        &self,
        recipient_id: Uuid,
        since: Option<chrono::DateTime<chrono::Utc>>,
        limit: i64,
    ) -> Result<Vec<NotificationEvent>, DomainError>;

    async fn ack_notification_events(
        &self,
        recipient_id: Uuid,
        ids: &[Uuid],
    ) -> Result<(), DomainError>;
}
