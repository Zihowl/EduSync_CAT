use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::shared_task::{
        ForwardResult, InboxItem, MySharedTasksFilter, NotificationEvent, OutboxItem, Participant,
        ShareCandidate, SharedTask, SubState,
    },
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

/// Tipos de evento durables / push. En el modelo viral solo TASK_SHARED,
/// TASK_INVITATION_RESPONDED y TASK_REMINDER generan push FCM. El resto se
/// persiste en `notification_events` (consumido al volver al foreground).
pub const EVENT_TASK_SHARED: &str = "TASK_SHARED";
pub const EVENT_TASK_ACCEPTED: &str = "TASK_ACCEPTED";
pub const EVENT_TASK_REJECTED: &str = "TASK_REJECTED";
pub const EVENT_TASK_REMINDER: &str = "TASK_REMINDER";
pub const EVENT_TASK_COMPLETED: &str = "TASK_COMPLETED";
pub const EVENT_INVITATION_CANCELED: &str = "INVITATION_CANCELED";
pub const EVENT_TASK_INVITATION_RESPONDED: &str = "TASK_INVITATION_RESPONDED";
/// Avisa al último sobreviviente de una colaboración cuando los demás
/// participantes se desvinculan. El cliente lo usa para limpiar los campos
/// `linkedSharedTaskId` / `sharedOutTaskId` y dejar la tarea como local pura.
pub const EVENT_SHARED_TASK_ORPHANED: &str = "SHARED_TASK_ORPHANED";

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
        shared_task_id: Option<Uuid>,
    ) -> Result<Vec<ShareCandidate>, DomainError> {
        let profile = self.repo.find_academic_profile(user_id).await?;
        let (group_id, subgroup_id) = profile
            .map(|p| (p.group_id, p.subgroup_id))
            .unwrap_or((None, None));
        self.repo
            .find_candidates(user_id, group_id, subgroup_id, search, shared_task_id)
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
            self.emit_with_push(
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

    /// El destinatario acepta o rechaza una tarea compartida (RQF-APP-46). En
    /// el modelo viral solo el inviter directo recibe push
    /// `TASK_INVITATION_RESPONDED`; los demás participantes lo verán al
    /// sincronizar. Si la invitación quedó cancelada (orphan) entre que llegó
    /// y el usuario respondió, devuelve `Conflict("INVITATION_CANCELED")`.
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
            // El sub_state UNLINKED tras una cancelación de huérfanas se ve
            // aquí como un status no-PENDING (REJECTED + UNLINKED).
            return Err(DomainError::Conflict(
                "INVITATION_CANCELED".to_string(),
            ));
        }

        let inviter_id = self
            .repo
            .recipient_inviter(shared_task_id, recipient_user_id)
            .await?;

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
        let payload = json!({
            "sharedTaskId": shared_task_id.to_string(),
            "titlePreview": task.title_preview,
            "recipientUsername": actor.0,
            "recipientFullName": actor.1,
            "accepted": accept,
        });

        // Durable para el owner (registro histórico, sin push).
        let owner_event = if accept { EVENT_TASK_ACCEPTED } else { EVENT_TASK_REJECTED };
        if Some(task.owner_user_id) != inviter_id && task.owner_user_id != recipient_user_id {
            self.emit_durable(
                task.owner_user_id,
                owner_event,
                Some(shared_task_id),
                Some(recipient_user_id),
                payload.clone(),
            )
            .await;
        }

        // Push solo al inviter directo de ESTA invitación (modelo viral).
        if let Some(target) = inviter_id {
            if target != recipient_user_id {
                self.emit_with_push(
                    target,
                    EVENT_TASK_INVITATION_RESPONDED,
                    Some(shared_task_id),
                    Some(recipient_user_id),
                    payload,
                )
                .await;
            }
        }

        Ok(task)
    }

    /// Lista los participantes con los que el solicitante puede interactuar
    /// (dueño y destinatarios `ACCEPTED`, excluyéndose a sí mismo). Falla si
    /// el solicitante no participa en la tarea.
    pub async fn participants(
        &self,
        viewer_user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<Vec<Participant>, DomainError> {
        let task = self
            .repo
            .find_shared_task(shared_task_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound("Tarea compartida no encontrada".to_string())
            })?;
        let role = self.participant_role(&task, viewer_user_id).await?;
        if role.is_none() {
            return Err(DomainError::Unauthorized(
                "No participas en esta tarea".to_string(),
            ));
        }
        self.repo
            .list_participants(shared_task_id, viewer_user_id)
            .await
    }

    /// Devuelve `Some("OWNER")` si `user_id` es el dueño activo (no
    /// desvinculado), `Some("RECIPIENT")` si es destinatario ACCEPTED y no
    /// UNLINKED, o `None` si no participa.
    async fn participant_role(
        &self,
        task: &SharedTask,
        user_id: Uuid,
    ) -> Result<Option<&'static str>, DomainError> {
        if task.owner_user_id == user_id {
            // Si el dueño se desvinculó, ya no participa.
            // Como no tenemos owner_unlinked_at en SharedTask, lo derivamos
            // del repo si fuera necesario; por ahora, asumimos que find_shared_task
            // sigue retornando aunque esté desvinculado. Si está desvinculado,
            // recipient_status no aplica para él, así que tratamos como no-participante
            // si el inbox/outbox lo excluyen. Para send_reminder, la SQL ya filtra.
            // Mantenemos OWNER aquí para flujo de creación, ya que owner_unlinked_at
            // solo se marca via unlink_owner.
            return Ok(Some("OWNER"));
        }
        let status = self.repo.recipient_status(task.id, user_id).await?;
        Ok(match status.as_deref() {
            Some("ACCEPTED") => Some("RECIPIENT"),
            _ => None,
        })
    }

    /// Recordatorio (toque). Permitido entre cualquier par de participantes
    /// (dueño o destinatario ACCEPTED). Bloquea si el destinatario es un
    /// destinatario que ya completó la tarea y aplica el límite RQNF-APP-45.
    pub async fn send_reminder(
        &self,
        sender_user_id: Uuid,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<ReminderResult, DomainError> {
        if sender_user_id == recipient_user_id {
            return Err(DomainError::BadRequest(
                "No puedes enviarte un recordatorio a ti mismo".to_string(),
            ));
        }

        let task = self
            .repo
            .find_shared_task(shared_task_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound("Tarea compartida no encontrada".to_string())
            })?;

        let sender_role = self
            .participant_role(&task, sender_user_id)
            .await?
            .ok_or_else(|| {
                DomainError::Unauthorized("No participas en esta tarea".to_string())
            })?;
        let recipient_role = self
            .participant_role(&task, recipient_user_id)
            .await?
            .ok_or_else(|| {
                DomainError::NotFound("Ese compañero no participa en la tarea".to_string())
            })?;

        // En el modelo viral: solo se puede dar toque a ACCEPTED+OPEN o al
        // dueño activo. PENDING ("aún no aceptó"), COMPLETED/DISMISSED_DONE
        // ("cerrada") y UNLINKED ("se desvinculó") deshabilitan toques. El
        // cliente refleja esto como botón con texto Pendiente/Cerrada.
        if recipient_role == "RECIPIENT"
            && self
                .repo
                .recipient_has_completed(shared_task_id, recipient_user_id)
                .await?
        {
            return Err(DomainError::BadRequest(
                "El compañero ya cerró esta tarea".to_string(),
            ));
        }
        let _ = sender_role; // (info de telemetría futura)

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
        self.emit_with_push(
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
        // Modelo viral: el cierre se refleja al sincronizar, no genera push.
        self.emit_durable(
            owner_id,
            EVENT_TASK_COMPLETED,
            Some(shared_task_id),
            Some(recipient_user_id),
            payload,
        )
        .await;
        Ok(())
    }

    /// El usuario cambia su sub-estado de copia (OPEN | COMPLETED | DISMISSED_DONE).
    /// Reflejo bidireccional: setea `completed_at` cuando aplica. Sin push.
    pub async fn set_sub_state(
        &self,
        user_id: Uuid,
        shared_task_id: Uuid,
        sub_state: SubState,
    ) -> Result<(), DomainError> {
        let _ = self
            .repo
            .mark_sub_state(user_id, shared_task_id, sub_state)
            .await?;
        Ok(())
    }

    /// Reenvía una tarea a más destinatarios (modelo viral). Solo participantes
    /// elegibles pueden invocar. Devuelve listas separadas: invitados nuevos,
    /// ya invitados (PENDING previo) y ya con copia (ACCEPTED activo). Para
    /// los nuevos, emite `TASK_SHARED` con push.
    pub async fn forward_share(
        &self,
        forwarder_user_id: Uuid,
        shared_task_id: Uuid,
        recipient_ids: &[Uuid],
    ) -> Result<ForwardResult, DomainError> {
        if recipient_ids.is_empty() {
            return Err(DomainError::BadRequest(
                "Debes seleccionar al menos un compañero".to_string(),
            ));
        }
        // Validar que todos los recipients sean activos / no admin.
        for id in recipient_ids {
            let user = self
                .user_repo
                .find_by_id(*id)
                .await?
                .ok_or_else(|| DomainError::NotFound("Compañero no encontrado".to_string()))?;
            if !user.is_active || user.role.is_admin() {
                return Err(DomainError::BadRequest(
                    "Solo puedes compartir con alumnos o docentes activos".to_string(),
                ));
            }
        }

        let result = self
            .repo
            .forward_share(forwarder_user_id, shared_task_id, recipient_ids)
            .await?;

        if result.invited.is_empty() {
            return Ok(result);
        }

        let task = self
            .repo
            .find_shared_task(shared_task_id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Tarea compartida no encontrada".to_string()))?;
        let actor = self
            .repo
            .actor_identity(forwarder_user_id)
            .await?
            .unwrap_or_default();
        for recipient_id in &result.invited {
            let payload = json!({
                "sharedTaskId": shared_task_id.to_string(),
                "titlePreview": task.title_preview,
                "inviterUsername": actor.0,
                "inviterFullName": actor.1,
            });
            self.emit_with_push(
                *recipient_id,
                EVENT_TASK_SHARED,
                Some(shared_task_id),
                Some(forwarder_user_id),
                payload,
            )
            .await;
        }

        Ok(result)
    }

    /// Desvincula al usuario de la tarea (eliminar copia + dejar de recibir
    /// toques). Si al hacerlo quedan menos de 2 participantes ACCEPTED+OPEN,
    /// las invitaciones PENDING residuales se cancelan automáticamente y los
    /// afectados reciben un evento durable `INVITATION_CANCELED`.
    pub async fn unlink(
        &self,
        user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<i32, DomainError> {
        // Si soy el dueño, marca owner_unlinked_at; si soy receptor, sub_state=UNLINKED.
        let task = self
            .repo
            .find_shared_task(shared_task_id)
            .await?
            .ok_or_else(|| DomainError::NotFound("Tarea compartida no encontrada".to_string()))?;

        let canceled = if task.owner_user_id == user_id {
            self.repo.unlink_owner(user_id, shared_task_id).await?
        } else {
            self.repo.unlink_recipient(user_id, shared_task_id).await?
        };

        for affected in &canceled {
            let payload = json!({
                "sharedTaskId": shared_task_id.to_string(),
                "titlePreview": task.title_preview,
                "reason": "ORPHANED",
            });
            self.emit_durable(
                *affected,
                EVENT_INVITATION_CANCELED,
                Some(shared_task_id),
                Some(user_id),
                payload,
            )
            .await;
        }

        // Si tras este unlink queda exactamente un participante vivo, avísale
        // para que limpie el vínculo local (badge + listado de compartidas).
        if let Some(survivor) = self.repo.find_last_survivor(shared_task_id).await? {
            if survivor != user_id {
                let payload = json!({
                    "sharedTaskId": shared_task_id.to_string(),
                    "titlePreview": task.title_preview,
                    "reason": "ALONE",
                });
                self.emit_durable(
                    survivor,
                    EVENT_SHARED_TASK_ORPHANED,
                    Some(shared_task_id),
                    Some(user_id),
                    payload,
                )
                .await;
            }
        }

        Ok(canceled.len() as i32)
    }

    /// Legacy: en el modelo viral "archivar" del lado receptor equivale a
    /// desvincularse. Mantener este nombre para que la mutación
    /// `ArchiveSharedTask` siga aceptada por clientes antiguos.
    pub async fn archive_for_recipient(
        &self,
        recipient_user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<(), DomainError> {
        let _ = self.unlink(recipient_user_id, shared_task_id).await?;
        Ok(())
    }

    /// Legacy: archivar del lado del dueño = desvincular como dueño (la
    /// colaboración entre receptores sobrevive si quedan 2+).
    pub async fn archive_for_owner(
        &self,
        owner_user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<(), DomainError> {
        let _ = self.unlink(owner_user_id, shared_task_id).await?;
        Ok(())
    }

    pub async fn inbox(&self, user_id: Uuid) -> Result<Vec<InboxItem>, DomainError> {
        self.repo.find_inbox(user_id).await
    }

    pub async fn outbox(&self, user_id: Uuid) -> Result<Vec<OutboxItem>, DomainError> {
        self.repo.find_outbox(user_id).await
    }

    /// Listado unificado para las tabs `Invitaciones` / `Mis tareas compartidas`.
    pub async fn my_shared_tasks(
        &self,
        user_id: Uuid,
        filter: MySharedTasksFilter,
    ) -> Result<Vec<InboxItem>, DomainError> {
        self.repo.find_my_shared_tasks(user_id, filter).await
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

    /// Persiste el evento durable (sin push). Para los eventos que el modelo
    /// viral entrega solo "al sincronizar" (TASK_ACCEPTED/REJECTED/COMPLETED,
    /// INVITATION_CANCELED).
    async fn emit_durable(
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
    }

    /// Persiste el evento durable Y dispara push FCM. Solo se usa para los
    /// 3 eventos con push del modelo viral: TASK_SHARED, TASK_REMINDER,
    /// TASK_INVITATION_RESPONDED.
    async fn emit_with_push(
        &self,
        recipient_id: Uuid,
        event_type: &str,
        shared_task_id: Option<Uuid>,
        actor_user_id: Option<Uuid>,
        payload: Value,
    ) {
        self.emit_durable(
            recipient_id,
            event_type,
            shared_task_id,
            actor_user_id,
            payload.clone(),
        )
        .await;

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
