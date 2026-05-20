use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_auth,
        graphql::{schema::to_gql_error, types::user_file_type::UserFileType},
    },
    domain::ports::user_file_repository::UserFileRepository,
};

#[derive(Default)]
pub struct FileQuery;

#[Object]
impl FileQuery {
    /// Lista todos los archivos adjuntos cifrados del usuario autenticado,
    /// incluidos los tombstones, para que el cliente propague los borrados.
    #[graphql(name = "myFiles")]
    async fn my_files(
        &self,
        ctx: &Context<'_>,
    ) -> async_graphql::Result<Vec<UserFileType>> {
        let user = require_auth(ctx)?;
        let repo = ctx.data::<Arc<dyn UserFileRepository>>()?;
        repo.list_for_user(user.user_id)
            .await
            .map(|v| v.into_iter().map(Into::into).collect())
            .map_err(to_gql_error)
    }

    /// Descarga un archivo adjunto cifrado concreto del usuario autenticado.
    #[graphql(name = "myFile")]
    async fn my_file(
        &self,
        ctx: &Context<'_>,
        file_uuid: String,
    ) -> async_graphql::Result<Option<UserFileType>> {
        let user = require_auth(ctx)?;
        let repo = ctx.data::<Arc<dyn UserFileRepository>>()?;
        repo.find(user.user_id, file_uuid.trim())
            .await
            .map(|v| v.map(Into::into))
            .map_err(to_gql_error)
    }
}
