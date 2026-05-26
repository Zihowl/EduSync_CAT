use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::shared_task::{InboxItem, NotificationEvent, OutboxItem, ShareCandidate, SharedTask},
    ports::{
        collaboration_repository::CollaborationRepository,
        notification_sender::{NotificationError, NotificationSender, PushMessage},
        user_repository::UserRepository,
    },
};

/// Máximo de recordatorios por usuario, por tarea, en 24 horas (RQNF-APP-45).
const MAX_REMINDERS_PER_24H: i64 = 3;

/// Servicio de colaboración de tareas: compartir, aceptar/rechazar, recordar,
/// completar, archivar (RQF-APP-45/46/47 + decisiones de producto 009).
#[derive(Clone)]
pub struct CollaborationService {
    repo: Arc<dyn CollaborationRepository>,
    user_repo: Arc<dyn UserRepository>,
    notifier: Arc<dyn NotificationSender>,
}

/// Resultado de enviar un recordatorio: cuántos quedan disponibles.
pub struct ReminderResult {
    pub remaining: i64,
}

/// Tipos de evento durables / push.
pub const EVENT_TASK_SHARED: &str = "TASK_SHARED";
pub const EVENT_TASK_ACCEPTED: &str = "TASK_ACCEPTED";
pub const EVENT_TASK_REJECTED: &str = "TASK_REJECTED";
pub const EVENT_TASK_REMINDER: &str = "TASK_REMINDER";
pub const EVENT_TASK_COMPLETED: &str = "TASK_COMPLETED";

impl CollaborationService {
    pub fn new(
        repo: Arc<dyn CollaborationRepository>,
        user_repo: Arc<dyn UserRepository>,
        notifier: Arc<dyn NotificationSender>,
    ) -> Self {
        Self {
            repo,
            user_repo,
            notifier,
        }
    }

    pub async fn set_academic_profile(
        &self,
        user_id: Uuid,
        group_id: Option<i32>,
        subgroup_id: Option<i32>,
    ) -> Result<(), DomainError> {
        let group_id = group_id.filter(|v| *v > 0);
        let subgroup_id = subgroup_id.filter(|v| *v > 0);
        self.repo
            .upsert_academic_profile(user_id, group_id, subgroup_id)
            .await
    }

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

    /// Comparte una tarea cifrada con compañeros (RQF-APP-45). Tras crear la
    /// fila emite un `TASK_SHARED` por cada destinatario y un push FCM.
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

        let scope_norm = match scope {
            "GROUP" => "GROUP",
            _ => "SELECTED",
        };
        let title_clean: String = title_preview.trim().chars().take(120).collect();

        let task = self
            .repo
            .create_shared_task(
                owner_user_id,
                ciphertext,
                enc_key,
                scope_norm,
                &title_clean,
                &unique,
            )
            .await?;

        let actor = self.repo.actor_identity(owner_user_id).await?.unwrap_or_default();
        for recipient_id in &unique {
            let payload = json!({
                "sharedTaskId": task.id.to_string(),
                "titlePreview": task.title_preview,
                "ownerUsername": actor.0,
                "ownerFullName": actor.1,
            });
            self.emit(
                *recipient_id,
                EVENT_TASK_SHARED,
                Some(task.id),
                Some(owner_user_id),
                payload,
            )
            .await;
        }

        Ok(task)
    }

    /// El destinatario acepta o rechaza una tarea compartida (RQF-APP-46) y
    /// se notifica al owner del resultado.
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

        let task = self
            .repo
            .find_shared_task(shared_task_id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Tarea compartida no encontrada".to_string()))?;

        let actor = self
            .repo
            .actor_identity(recipient_user_id)
            .await?
            .unwrap_or_default();
        let event = if accept {
            EVENT_TASK_ACCEPTED
        } else {
            EVENT_TASK_REJECTED
        };
        let payload = json!({
            "sharedTaskId": shared_task_id.to_string(),
            "titlePreview": task.title_preview,
            "recipientUsername": actor.0,
            "recipientFullName": actor.1,
        });
        self.emit(
            task.owner_user_id,
            event,
            Some(shared_task_id),
            Some(recipient_user_id),
            payload,
        )
        .await;

        Ok(task)
    }

    /// Recordatorio (toque). Bloquea si el destinatario ya completó y aplica
    /// el límite RQNF-APP-45.
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

        if self
            .repo
            .recipient_has_completed(shared_task_id, recipient_user_id)
            .await?
        {
            return Err(DomainError::BadRequest(
                "El compañero ya completó esta tarea".to_string(),
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

        let actor = self
            .repo
            .actor_identity(sender_user_id)
            .await?
            .unwrap_or_default();
        let payload = json!({
            "sharedTaskId": shared_task_id.to_string(),
            "titlePreview": task.title_preview,
            "senderUsername": actor.0,
            "senderFullName": actor.1,
        });
        self.emit(
            recipient_user_id,
            EVENT_TASK_REMINDER,
            Some(shared_task_id),
            Some(sender_user_id),
            payload,
        )
        .await;

        Ok(ReminderResult {
            remaining: MAX_REMINDERS_PER_24H - (sent + 1),
        })
    }

    pub async fn mark_completed(
        &self,
        recipient_user_id: Uuid,
        shared_task_id: Uuid,
        completed: bool,
    ) -> Result<(), DomainError> {
        let owner_id = self
            .repo
            .set_recipient_completed(shared_task_id, recipient_user_id, completed)
            .await?;
        if !completed {
            // Reabrir no notifica al owner (puede usar el polling para verlo).
            return Ok(());
        }
        let actor = self
            .repo
            .actor_identity(recipient_user_id)
            .await?
            .unwrap_or_default();
        let task_title = self
            .repo
            .find_shared_task(shared_task_id)
            .await?
            .map(|t| t.title_preview)
            .unwrap_or_default();
        let payload = json!({
            "sharedTaskId": shared_task_id.to_string(),
            "titlePreview": task_title,
            "recipientUsername": actor.0,
            "recipientFullName": actor.1,
        });
        self.emit(
            owner_id,
            EVENT_TASK_COMPLETED,
            Some(shared_task_id),
            Some(recipient_user_id),
            payload,
        )
        .await;
        Ok(())
    }

    pub async fn archive_for_recipient(
        &self,
        recipient_user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<(), DomainError> {
        self.repo
            .archive_for_recipient(shared_task_id, recipient_user_id)
            .await
    }

    pub async fn archive_for_owner(
        &self,
        owner_user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<(), DomainError> {
        self.repo
            .archive_for_owner(shared_task_id, owner_user_id)
            .await
    }

    pub async fn inbox(&self, user_id: Uuid) -> Result<Vec<InboxItem>, DomainError> {
        self.repo.find_inbox(user_id).await
    }

    pub async fn outbox(&self, user_id: Uuid) -> Result<Vec<OutboxItem>, DomainError> {
        self.repo.find_outbox(user_id).await
    }

    // ----- Tokens FCM -----

    pub async fn register_device_token(
        &self,
        user_id: Uuid,
        token: &str,
    ) -> Result<(), DomainError> {
        let clean = token.trim();
        if clean.is_empty() {
            return Err(DomainError::BadRequest(
                "Token de dispositivo vacío".to_string(),
            ));
        }
        self.repo
            .register_device_token(user_id, clean, "ANDROID")
            .await
    }

    pub async fn unregister_device_token(
        &self,
        user_id: Uuid,
        token: &str,
    ) -> Result<(), DomainError> {
        self.repo.unregister_device_token(user_id, token.trim()).await
    }

    // ----- Eventos durables -----

    pub async fn notification_events(
        &self,
        recipient_id: Uuid,
        since: Option<DateTime<Utc>>,
        limit: i64,
    ) -> Result<Vec<NotificationEvent>, DomainError> {
        self.repo
            .find_notification_events(recipient_id, since, limit)
            .await
    }

    pub async fn ack_notification_events(
        &self,
        recipient_id: Uuid,
        ids: &[Uuid],
    ) -> Result<(), DomainError> {
        self.repo.ack_notification_events(recipient_id, ids).await
    }

    /// Persiste el evento (durabilidad: lo levantará el polling de respaldo
    /// del cliente) y dispara los pushes FCM en best-effort. Errores de FCM
    /// solo se loguean.
    async fn emit(
        &self,
        recipient_id: Uuid,
        event_type: &str,
        shared_task_id: Option<Uuid>,
        actor_user_id: Option<Uuid>,
        payload: Value,
    ) {
        let payload_str = payload.to_string();
        if let Err(e) = self
            .repo
            .create_notification_event(
                recipient_id,
                event_type,
                shared_task_id,
                actor_user_id,
                &payload_str,
            )
            .await
        {
            tracing::warn!(error = ?e, event_type, "no se pudo persistir notification_event");
        }

        let tokens = match self.repo.tokens_for_user(recipient_id).await {
            Ok(t) => t,
            Err(e) => {
                tracing::warn!(error = ?e, "no se pudieron leer device_tokens");
                return;
            }
        };
        for token in tokens {
            let push = PushMessage {
                token: token.clone(),
                event_type: event_type.to_string(),
                data: payload.clone(),
            };
            match self.notifier.send(push).await {
                Ok(_) => {}
                Err(NotificationError::InvalidToken) => {
                    let _ = self.repo.drop_token(&token).await;
                }
                Err(e) => {
                    tracing::warn!(error = ?e, "fallo al enviar push FCM");
                }
            }
        }
    }

}
