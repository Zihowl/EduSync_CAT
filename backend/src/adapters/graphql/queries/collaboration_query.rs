use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_auth,
        graphql::{
            schema::to_gql_error,
            types::collaboration_type::{
                ShareCandidateType, SharedTaskInboxItemType, SharedTaskOutboxItemType,
            },
        },
    },
    domain::services::collaboration_service::CollaborationService,
};

#[derive(Default)]
pub struct CollaborationQuery;

#[Object]
impl CollaborationQuery {
    /// Compañeros con los que el usuario puede compartir tareas: los del mismo
    /// grupo/subgrupo y, si se da `search`, coincidencias por username.
    #[graphql(name = "ShareCandidates")]
    async fn share_candidates(
        &self,
        ctx: &Context<'_>,
        search: Option<String>,
    ) -> async_graphql::Result<Vec<ShareCandidateType>> {
        let user = require_auth(ctx)?;
        let svc = ctx.data::<Arc<CollaborationService>>()?;
        let search = search.as_deref().filter(|s| !s.trim().is_empty());
        svc.list_candidates(user.user_id, search)
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
}
