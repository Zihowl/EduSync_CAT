use async_trait::async_trait;
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::shared_task::{
        AcademicProfile, InboxItem, OutboxItem, ShareCandidate, SharedTask,
    },
};

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

    /// Compañeros candidatos: alumnos/docentes del mismo grupo o subgrupo, y/o
    /// coincidencias por nombre de usuario cuando se proporciona `search`.
    async fn find_candidates(
        &self,
        exclude_user_id: Uuid,
        group_id: Option<i32>,
        subgroup_id: Option<i32>,
        search: Option<&str>,
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
}
