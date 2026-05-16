use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_auth,
        graphql::{schema::to_gql_error, types::user_backup_type::UserBackupType},
    },
    domain::ports::user_backup_repository::UserBackupRepository,
};

#[derive(Default)]
pub struct BackupQuery;

#[Object]
impl BackupQuery {
    /// Devuelve el respaldo cifrado del usuario autenticado, o null si no tiene.
    #[graphql(name = "myBackup")]
    async fn my_backup(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Option<UserBackupType>> {
        let user = require_auth(ctx)?;
        let repo = ctx.data::<Arc<dyn UserBackupRepository>>()?;
        repo.find_by_user(user.user_id)
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}
