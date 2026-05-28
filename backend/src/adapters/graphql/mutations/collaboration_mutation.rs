use std::sync::Arc;

use async_graphql::{Context, Object};
use uuid::Uuid;

use crate::{
    adapters::{
        auth::middleware::require_auth,
        graphql::{
            inputs::collaboration_input::{
                AcademicProfileInput, AckNotificationEventsInput, ArchiveSharedTaskInput,
                DeviceTokenInput, ForwardSharedTaskInput, MarkSharedTaskCompletedInput,
                RespondSharedTaskInput, SendTaskReminderInput, SetSharedTaskSubStateInput,
                ShareTaskInput, UnlinkSharedTaskInput,
            },
            realtime::{publish_realtime_event, RealtimeScope},
            schema::to_gql_error,
            types::collaboration_type::{
                ForwardSharedTaskResultType, RespondSharedTaskResultType,
                SendTaskReminderResultType, ShareTaskResultType,
            },
        },
    },
    domain::{
        errors::DomainError,
        models::shared_task::SubState,
        services::collaboration_service::CollaborationService,
    },
};

fn parse_uuid(value: &str, field: &str) -> Result<Uuid, async_graphql::Error> {
    Uuid::parse_str(value.trim())
        .map_err(|_| to_gql_error(DomainError::BadRequest(format!("{field} inválido"))))
}

#[derive(Default)]
pub struct CollaborationMutation;

#[Object]
impl CollaborationMutation {
    /// Publica el grupo/subgrupo al que está suscrito el alumno (RQNF-APP-43).
    #[graphql(name = "SetAcademicProfile")]
    async fn set_academic_profile(
        &self,
        ctx: &Context<'_>,
        input: AcademicProfileInput,
    ) -> async_graphql::Result<bool> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        svc.set_academic_profile(user.user_id, input.group_id, input.subgroup_id)
            .await
            .map_err(to_gql_error)?;
        Ok(true)
    }

    /// Comparte una tarea cifrada con compañeros (RQF-APP-45).
    #[graphql(name = "ShareTask")]
    async fn share_task(
        &self,
        ctx: &Context<'_>,
        input: ShareTaskInput,
    ) -> async_graphql::Result<ShareTaskResultType> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;

        let recipient_ids = input
            .recipient_ids
            .iter()
            .map(|id| parse_uuid(id, "Compañero"))
            .collect::<Result<Vec<_>, _>>()?;

        let task = svc
            .share_task(
                user.user_id,
                &input.ciphertext,
                &input.enc_key,
                &input.scope,
                &input.title_preview,
                &recipient_ids,
            )
            .await
            .map_err(to_gql_error)?;

        publish_realtime_event(ctx, &[RealtimeScope::Collaboration]);
        Ok(ShareTaskResultType {
            shared_task_id: task.id.to_string(),
            recipient_count: recipient_ids.len() as i32,
        })
    }

    /// Acepta o rechaza una tarea compartida (RQF-APP-46).
    #[graphql(name = "RespondSharedTask")]
    async fn respond_shared_task(
        &self,
        ctx: &Context<'_>,
        input: RespondSharedTaskInput,
    ) -> async_graphql::Result<RespondSharedTaskResultType> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let shared_task_id = parse_uuid(&input.shared_task_id, "Tarea compartida")?;

        let task = svc
            .respond(user.user_id, shared_task_id, input.accept)
            .await
            .map_err(to_gql_error)?;

        publish_realtime_event(ctx, &[RealtimeScope::Collaboration]);
        Ok(RespondSharedTaskResultType {
            accepted: input.accept,
            ciphertext: input.accept.then(|| task.ciphertext.clone()),
            enc_key: input.accept.then(|| task.enc_key.clone()),
        })
    }

    /// Envía un recordatorio (toque) a un compañero (RQF-APP-47/RQNF-APP-45).
    #[graphql(name = "SendTaskReminder")]
    async fn send_task_reminder(
        &self,
        ctx: &Context<'_>,
        input: SendTaskReminderInput,
    ) -> async_graphql::Result<SendTaskReminderResultType> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let shared_task_id = parse_uuid(&input.shared_task_id, "Tarea compartida")?;
        let recipient_id = parse_uuid(&input.recipient_id, "Compañero")?;

        let result = svc
            .send_reminder(user.user_id, shared_task_id, recipient_id)
            .await
            .map_err(to_gql_error)?;

        publish_realtime_event(ctx, &[RealtimeScope::Collaboration]);
        Ok(SendTaskReminderResultType {
            remaining: result.remaining,
        })
    }

    /// El destinatario marca o desmarca completada su copia local de la
    /// tarea. Al completarla, notifica al owner y bloquea futuros toques.
    #[graphql(name = "MarkSharedTaskCompleted")]
    async fn mark_shared_task_completed(
        &self,
        ctx: &Context<'_>,
        input: MarkSharedTaskCompletedInput,
    ) -> async_graphql::Result<bool> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let shared_task_id = parse_uuid(&input.shared_task_id, "Tarea compartida")?;
        svc.mark_completed(user.user_id, shared_task_id, input.completed)
            .await
            .map_err(to_gql_error)?;
        publish_realtime_event(ctx, &[RealtimeScope::Collaboration]);
        Ok(true)
    }

    /// Archiva una tarea compartida. Si el llamador es el dueño, archiva su
    /// outbox; si es destinatario, archiva su inbox. Si es ambos (compartió
    /// y aceptó, escenario raro), archiva ambos lados.
    #[graphql(name = "ArchiveSharedTask")]
    async fn archive_shared_task(
        &self,
        ctx: &Context<'_>,
        input: ArchiveSharedTaskInput,
    ) -> async_graphql::Result<bool> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let shared_task_id = parse_uuid(&input.shared_task_id, "Tarea compartida")?;
        // Best-effort en ambos lados: si no aplica, devuelve NotFound silencioso.
        let _ = svc.archive_for_owner(user.user_id, shared_task_id).await;
        let _ = svc
            .archive_for_recipient(user.user_id, shared_task_id)
            .await;
        publish_realtime_event(ctx, &[RealtimeScope::Collaboration]);
        Ok(true)
    }

    /// Reenvía una tarea compartida existente a más compañeros (modelo viral).
    /// Cualquier participante activo puede ejecutarla. El servidor aplica
    /// anti-duplicado por `(shared_task_id, recipient)` y devuelve los grupos
    /// `invited` / `alreadyInvited` / `alreadyHasCopy`.
    #[graphql(name = "ForwardSharedTask")]
    async fn forward_shared_task(
        &self,
        ctx: &Context<'_>,
        input: ForwardSharedTaskInput,
    ) -> async_graphql::Result<ForwardSharedTaskResultType> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let shared_task_id = parse_uuid(&input.shared_task_id, "Tarea compartida")?;
        let recipient_ids = input
            .recipient_ids
            .iter()
            .map(|id| parse_uuid(id, "Compañero"))
            .collect::<Result<Vec<_>, _>>()?;

        let result = svc
            .forward_share(user.user_id, shared_task_id, &recipient_ids)
            .await
            .map_err(to_gql_error)?;

        publish_realtime_event(ctx, &[RealtimeScope::Collaboration]);
        Ok(ForwardSharedTaskResultType::from_forward(
            shared_task_id.to_string(),
            result,
        ))
    }

    /// Desvincula al solicitante de una tarea compartida. Si es el dueño,
    /// marca `owner_unlinked_at`; si es receptor, deja su fila en
    /// `sub_state='UNLINKED'`. Si tras esto quedan <2 participantes activos,
    /// las invitaciones PENDING se cancelan automáticamente y se notifica
    /// (durable) a los afectados. Devuelve cuántas invitaciones se cancelaron.
    #[graphql(name = "UnlinkSharedTask")]
    async fn unlink_shared_task(
        &self,
        ctx: &Context<'_>,
        input: UnlinkSharedTaskInput,
    ) -> async_graphql::Result<i32> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let shared_task_id = parse_uuid(&input.shared_task_id, "Tarea compartida")?;
        let orphans = svc
            .unlink(user.user_id, shared_task_id)
            .await
            .map_err(to_gql_error)?;
        publish_realtime_event(ctx, &[RealtimeScope::Collaboration]);
        Ok(orphans)
    }

    /// Cambia el sub-estado de la copia del solicitante: `OPEN`, `COMPLETED`
    /// o `DISMISSED_DONE`. Para desvincular usa `UnlinkSharedTask`.
    #[graphql(name = "SetSharedTaskSubState")]
    async fn set_shared_task_sub_state(
        &self,
        ctx: &Context<'_>,
        input: SetSharedTaskSubStateInput,
    ) -> async_graphql::Result<bool> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let shared_task_id = parse_uuid(&input.shared_task_id, "Tarea compartida")?;
        let sub_state = SubState::parse(&input.sub_state).ok_or_else(|| {
            to_gql_error(DomainError::BadRequest(
                "sub_state inválido (OPEN | COMPLETED | DISMISSED_DONE)".to_string(),
            ))
        })?;
        if matches!(sub_state, SubState::Unlinked) {
            return Err(to_gql_error(DomainError::BadRequest(
                "Usa UnlinkSharedTask para desvincularte".to_string(),
            )));
        }
        svc.set_sub_state(user.user_id, shared_task_id, sub_state)
            .await
            .map_err(to_gql_error)?;
        publish_realtime_event(ctx, &[RealtimeScope::Collaboration]);
        Ok(true)
    }

    /// Registra un token FCM del dispositivo actual.
    #[graphql(name = "RegisterDeviceToken")]
    async fn register_device_token(
        &self,
        ctx: &Context<'_>,
        input: DeviceTokenInput,
    ) -> async_graphql::Result<bool> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        svc.register_device_token(user.user_id, &input.token)
            .await
            .map_err(to_gql_error)?;
        Ok(true)
    }

    /// Da de baja un token FCM (logout, desinstalación, etc.).
    #[graphql(name = "UnregisterDeviceToken")]
    async fn unregister_device_token(
        &self,
        ctx: &Context<'_>,
        input: DeviceTokenInput,
    ) -> async_graphql::Result<bool> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        svc.unregister_device_token(user.user_id, &input.token)
            .await
            .map_err(to_gql_error)?;
        Ok(true)
    }

    /// Marca como entregados ('ack') los eventos durables que el cliente ya
    /// procesó para evitar duplicar notificaciones al siguiente polling.
    #[graphql(name = "AckNotificationEvents")]
    async fn ack_notification_events(
        &self,
        ctx: &Context<'_>,
        input: AckNotificationEventsInput,
    ) -> async_graphql::Result<bool> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let ids = input
            .ids
            .iter()
            .map(|id| parse_uuid(id, "Evento"))
            .collect::<Result<Vec<_>, _>>()?;
        svc.ack_notification_events(user.user_id, &ids)
            .await
            .map_err(to_gql_error)?;
        Ok(true)
    }
}
