use std::sync::Arc;

use async_graphql::{Context, Object};

use crate::{
    adapters::{
        auth::middleware::require_auth,
        graphql::{
            inputs::user_file_input::UploadFileInput, schema::to_gql_error,
            types::user_file_type::UserFileType,
        },
    },
    domain::ports::user_file_repository::UserFileRepository,
};

#[derive(Default)]
pub struct FileMutation;

#[Object]
impl FileMutation {
    /// Sube (crea o reemplaza) un archivo adjunto cifrado del usuario autenticado.
    #[graphql(name = "uploadUserFile")]
    async fn upload_user_file(
        &self,
        ctx: &Context<'_>,
        input: UploadFileInput,
    ) -> async_graphql::Result<UserFileType> {
        let user = require_auth(ctx)?;
        if input.file_uuid.trim().is_empty() {
            return Err(async_graphql::Error::new("El archivo necesita un identificador"));
        }
        if input.ciphertext.trim().is_empty() {
            return Err(async_graphql::Error::new("El archivo no puede estar vacío"));
        }
        let repo = ctx.data::<Arc<dyn UserFileRepository>>()?;
        repo.upsert(
            user.user_id,
            input.file_uuid.trim(),
            &input.ciphertext,
            &input.file_name,
            input.file_size,
        )
        .await
        .map(Into::into)
        .map_err(to_gql_error)
    }

    /// Marca un archivo adjunto del usuario como borrado (tombstone).
    #[graphql(name = "deleteUserFile")]
    async fn delete_user_file(
        &self,
        ctx: &Context<'_>,
        file_uuid: String,
    ) -> async_graphql::Result<bool> {
        let user = require_auth(ctx)?;
        let repo = ctx.data::<Arc<dyn UserFileRepository>>()?;
        repo.soft_delete(user.user_id, file_uuid.trim())
            .await
            .map_err(to_gql_error)
    }
}
