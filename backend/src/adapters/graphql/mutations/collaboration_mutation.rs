use std::sync::Arc;

use async_graphql::{Context, Object};
use uuid::Uuid;

use crate::{
    adapters::{
        auth::middleware::require_auth,
        graphql::{
            inputs::collaboration_input::{
                AcademicProfileInput, RespondSharedTaskInput, SendTaskReminderInput,
                ShareTaskInput,
            },
            realtime::{publish_realtime_event, RealtimeScope},
            schema::to_gql_error,
            types::collaboration_type::{
                RespondSharedTaskResultType, SendTaskReminderResultType, ShareTaskResultType,
            },
        },
    },
    domain::{errors::DomainError, services::collaboration_service::CollaborationService},
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
}
