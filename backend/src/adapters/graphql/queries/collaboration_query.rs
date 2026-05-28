use std::sync::Arc;

use async_graphql::{Context, Object};
use chrono::{DateTime, Utc};

use uuid::Uuid;

use crate::{
    adapters::{
        auth::middleware::require_auth,
        graphql::{
            schema::to_gql_error,
            types::collaboration_type::{
                NotificationEventType, ShareCandidateType, SharedTaskInboxItemType,
                SharedTaskOutboxItemType, SharedTaskParticipantType,
            },
        },
    },
    domain::{
        errors::DomainError,
        models::shared_task::MySharedTasksFilter,
        services::collaboration_service::CollaborationService,
    },
};

#[derive(Default)]
pub struct CollaborationQuery;

#[Object]
impl CollaborationQuery {
    /// Compañeros con los que el usuario puede compartir tareas: árbol del
    /// mismo grupo raíz del solicitante. Si se da `search`, filtra por
    /// username/nombre. Si se da `shared_task_id`, marca `alreadyInvited` /
    /// `alreadyHasCopy` (anti-duplicado al reenviar) sin revelar al inviter.
    #[graphql(name = "ShareCandidates")]
    async fn share_candidates(
        &self,
        ctx: &Context<'_>,
        search: Option<String>,
        shared_task_id: Option<String>,
    ) -> async_graphql::Result<Vec<ShareCandidateType>> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let search = search.as_deref().filter(|s| !s.trim().is_empty());
        let shared_task_id = match shared_task_id.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            Some(s) => Some(Uuid::parse_str(s).map_err(|_| {
                to_gql_error(DomainError::BadRequest("Tarea compartida inválida".to_string()))
            })?),
            None => None,
        };
        svc.list_candidates(user.user_id, search, shared_task_id)
            .await
            .map(|list| list.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    /// Listado unificado para las tabs "Invitaciones" y "Mis tareas
    /// compartidas". `filter` acepta `INVITATIONS` o `LINKED`.
    #[graphql(name = "MySharedTasks")]
    async fn my_shared_tasks(
        &self,
        ctx: &Context<'_>,
        filter: String,
    ) -> async_graphql::Result<Vec<SharedTaskInboxItemType>> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let filter = match filter.trim().to_ascii_uppercase().as_str() {
            "INVITATIONS" => MySharedTasksFilter::Invitations,
            "LINKED" => MySharedTasksFilter::Linked,
            _ => {
                return Err(to_gql_error(DomainError::BadRequest(
                    "filter inválido (INVITATIONS | LINKED)".to_string(),
                )))
            }
        };
        svc.my_shared_tasks(user.user_id, filter)
            .await
            .map(|list| list.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    /// Bandeja de entrada: tareas que me han compartido.
    #[graphql(name = "SharedTaskInbox")]
    async fn shared_task_inbox(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<SharedTaskInboxItemType>> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        svc.inbox(user.user_id)
            .await
            .map(|list| list.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    /// Bandeja de salida: tareas que yo he compartido y el estado de cada
    /// destinatario (para enviar recordatorios).
    #[graphql(name = "SharedTaskOutbox")]
    async fn shared_task_outbox(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<SharedTaskOutboxItemType>> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        svc.outbox(user.user_id)
            .await
            .map(|list| list.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    /// Participantes con los que puedo intercambiar toques sobre una tarea
    /// compartida: el dueño y los destinatarios `ACCEPTED`, excluyéndome a mí.
    /// Falla si no participo en la tarea.
    #[graphql(name = "SharedTaskParticipants")]
    async fn shared_task_participants(
        &self,
        ctx: &Context<'_>,
        shared_task_id: String,
    ) -> async_graphql::Result<Vec<SharedTaskParticipantType>> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let id = Uuid::parse_str(shared_task_id.trim())
            .map_err(|_| to_gql_error(DomainError::BadRequest("Tarea compartida inválida".to_string())))?;
        svc.participants(user.user_id, id)
            .await
            .map(|list| list.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    /// Eventos durables del usuario (TASK_SHARED, TASK_ACCEPTED, etc.). El
    /// cliente los consume al volver al foreground si el push FCM falló.
    /// `since` es exclusivo: filtra eventos con `created_at > since`.
    #[graphql(name = "MyNotificationEvents")]
    async fn my_notification_events(
        &self,
        ctx: &Context<'_>,
        since: Option<DateTime<Utc>>,
        limit: Option<i32>,
    ) -> async_graphql::Result<Vec<NotificationEventType>> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let limit = limit.unwrap_or(50) as i64;
        svc.notification_events(user.user_id, since, limit)
            .await
            .map(|list| list.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }
}
