use std::sync::Arc;

use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::shared_task::{InboxItem, OutboxItem, ShareCandidate, SharedTask},
    ports::{collaboration_repository::CollaborationRepository, user_repository::UserRepository},
};

/// Máximo de recordatorios por usuario, por tarea, en 24 horas (RQNF-APP-45).
const MAX_REMINDERS_PER_24H: i64 = 3;

/// Servicio de colaboración de tareas: compartir, aceptar/rechazar y enviar
/// recordatorios entre compañeros (RQF-APP-45/46/47).
#[derive(Clone)]
pub struct CollaborationService {
    repo: Arc<dyn CollaborationRepository>,
    user_repo: Arc<dyn UserRepository>,
}

/// Resultado de enviar un recordatorio: cuántos quedan disponibles.
pub struct ReminderResult {
    pub remaining: i64,
}

impl CollaborationService {
    pub fn new(
        repo: Arc<dyn CollaborationRepository>,
        user_repo: Arc<dyn UserRepository>,
    ) -> Self {
        Self { repo, user_repo }
    }

    /// Publica el grupo/subgrupo al que está suscrito el alumno. Es la base
    /// para listar compañeros candidatos (RQNF-APP-43).
    pub async fn set_academic_profile(
        &self,
        user_id: Uuid,
        group_id: Option<i32>,
        subgroup_id: Option<i32>,
    ) -> Result<(), DomainError> {
        // Un id <= 0 se interpreta como "sin selección".
        let group_id = group_id.filter(|v| *v > 0);
        let subgroup_id = subgroup_id.filter(|v| *v > 0);
        self.repo
            .upsert_academic_profile(user_id, group_id, subgroup_id)
            .await
    }

    /// Lista los compañeros con los que el usuario puede compartir: los del
    /// mismo grupo/subgrupo y, opcionalmente, coincidencias por username.
    pub async fn list_candidates(
        &self,
        user_id: Uuid,
        search: Option<&str>,
    ) -> Result<Vec<ShareCandidate>, DomainError> {
        let profile = self.repo.find_academic_profile(user_id).await?;
        let (group_id, subgroup_id) = profile
            .map(|p| (p.group_id, p.subgroup_id))
            .unwrap_or((None, None));
        self.repo
            .find_candidates(user_id, group_id, subgroup_id, search)
            .await
    }

    /// Comparte una tarea cifrada con uno o varios compañeros (RQF-APP-45).
    pub async fn share_task(
        &self,
        owner_user_id: Uuid,
        ciphertext: &str,
        enc_key: &str,
        scope: &str,
        title_preview: &str,
        recipient_ids: &[Uuid],
    ) -> Result<SharedTask, DomainError> {
        if ciphertext.trim().is_empty() || enc_key.trim().is_empty() {
            return Err(DomainError::BadRequest(
                "La tarea compartida no puede estar vacía".to_string(),
            ));
        }
        if recipient_ids.is_empty() {
            return Err(DomainError::BadRequest(
                "Debes seleccionar al menos un compañero".to_string(),
            ));
        }

        // Descarta duplicados y al propio remitente.
        let mut unique: Vec<Uuid> = Vec::new();
        for id in recipient_ids {
            if *id != owner_user_id && !unique.contains(id) {
                unique.push(*id);
            }
        }
        if unique.is_empty() {
            return Err(DomainError::BadRequest(
                "Debes seleccionar al menos un compañero".to_string(),
            ));
        }

        // Verifica que cada destinatario sea una cuenta de app activa.
        for id in &unique {
            let recipient = self
                .user_repo
                .find_by_id(*id)
                .await?
                .ok_or_else(|| DomainError::NotFound("Compañero no encontrado".to_string()))?;
            if !recipient.is_active || recipient.role.is_admin() {
                return Err(DomainError::BadRequest(
                    "Solo puedes compartir con alumnos o docentes activos".to_string(),
                ));
            }
        }

        let scope = match scope {
            "GROUP" => "GROUP",
            _ => "SELECTED",
        };
        let title_preview: String = title_preview.trim().chars().take(120).collect();

        self.repo
            .create_shared_task(
                owner_user_id,
                ciphertext,
                enc_key,
                scope,
                &title_preview,
                &unique,
            )
            .await
    }

    /// El destinatario acepta o rechaza una tarea compartida (RQF-APP-46).
    /// Al aceptar devuelve la tarea para que el cliente cree su copia local.
    pub async fn respond(
        &self,
        recipient_user_id: Uuid,
        shared_task_id: Uuid,
        accept: bool,
    ) -> Result<SharedTask, DomainError> {
        let status = self
            .repo
            .recipient_status(shared_task_id, recipient_user_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound("Tarea compartida no encontrada".to_string())
            })?;

        if status != "PENDING" {
            return Err(DomainError::Conflict(
                "Ya respondiste a esta tarea compartida".to_string(),
            ));
        }

        let new_status = if accept { "ACCEPTED" } else { "REJECTED" };
        self.repo
            .set_recipient_status(shared_task_id, recipient_user_id, new_status)
            .await?;

        self.repo
            .find_shared_task(shared_task_id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Tarea compartida no encontrada".to_string()))
    }

    /// Envía un recordatorio (toque) a un destinatario que aceptó la tarea.
    /// Aplica el límite de 3 por usuario/tarea/24 h (RQNF-APP-45).
    pub async fn send_reminder(
        &self,
        sender_user_id: Uuid,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<ReminderResult, DomainError> {
        let task = self
            .repo
            .find_shared_task(shared_task_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound("Tarea compartida no encontrada".to_string())
            })?;

        if task.owner_user_id != sender_user_id {
            return Err(DomainError::Unauthorized(
                "Solo quien compartió la tarea puede enviar recordatorios".to_string(),
            ));
        }

        let status = self
            .repo
            .recipient_status(shared_task_id, recipient_user_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound("El compañero no es destinatario de la tarea".to_string())
            })?;
        if status != "ACCEPTED" {
            return Err(DomainError::BadRequest(
                "Solo puedes recordar a quien ya aceptó la tarea".to_string(),
            ));
        }

        let sent = self
            .repo
            .count_reminders_last_24h(shared_task_id, sender_user_id, recipient_user_id)
            .await?;
        if sent >= MAX_REMINDERS_PER_24H {
            return Err(DomainError::Conflict(format!(
                "Alcanzaste el límite de {MAX_REMINDERS_PER_24H} recordatorios en 24 horas para este compañero"
            )));
        }

        self.repo
            .create_reminder(shared_task_id, sender_user_id, recipient_user_id)
            .await?;

        Ok(ReminderResult {
            remaining: MAX_REMINDERS_PER_24H - (sent + 1),
        })
    }

    pub async fn inbox(&self, user_id: Uuid) -> Result<Vec<InboxItem>, DomainError> {
        self.repo.find_inbox(user_id).await
    }

    pub async fn outbox(&self, user_id: Uuid) -> Result<Vec<OutboxItem>, DomainError> {
        self.repo.find_outbox(user_id).await
    }
}
