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
pub struct BackupMutation;

#[Object]
impl BackupMutation {
    /// Sube (crea o reemplaza) el respaldo cifrado del usuario autenticado.
    #[graphql(name = "uploadBackup")]
    async fn upload_backup(
        &self,
        ctx: &Context<'_>,
        ciphertext: String,
    ) -> async_graphql::Result<UserBackupType> {
        let user = require_auth(ctx)?;
        if ciphertext.trim().is_empty() {
            return Err(async_graphql::Error::new("El respaldo no puede estar vacío"));
        }
        let repo = ctx.data::<Arc<dyn UserBackupRepository>>()?;
        repo.upsert(user.user_id, &ciphertext)
            .await
            .map(Into::into)
            .map_err(to_gql_error)
    }
}
