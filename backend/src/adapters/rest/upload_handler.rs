use std::sync::Arc;

use axum::{
    extract::{Multipart, State},
    http::HeaderMap,
    Json,
};
use serde::Serialize;

use crate::{
    adapters::{
        auth::middleware::{read_active_auth_user_from_headers, AuthUser},
        graphql::realtime::RealtimeScope,
    },
    domain::services::excel_service::{ExcelPreviewResult, ExcelService},
    AppState,
};

#[derive(Serialize)]
pub struct UploadResponse {
    pub message: String,
    pub details: UploadDetails,
}

#[derive(Serialize)]
pub struct UploadDetails {
    pub success: bool,
    pub processed: usize,
    pub errors: Vec<String>,
}

#[derive(Serialize)]
pub struct UploadPreviewResponse {
    pub message: String,
    pub details: ExcelPreviewResult,
}

pub async fn upload_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, (axum::http::StatusCode, String)> {
    let auth_user = authorize_admin(&headers, &state).await?;
    let bytes = extract_uploaded_file(&mut multipart).await?;

    let excel_service: Arc<ExcelService> = state.excel_service.clone();
    let result = excel_service
        .process_schedule_file(&bytes, Some(auth_user.user_id))
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.msg()))?;

    if result.processed > 0 {
        state.realtime.publish_scopes(&[
            RealtimeScope::Teachers,
            RealtimeScope::Subjects,
            RealtimeScope::Buildings,
            RealtimeScope::Classrooms,
            RealtimeScope::Groups,
            RealtimeScope::Schedules,
        ]);
    }

    Ok(Json(UploadResponse {
        message: "Procesamiento completado".to_string(),
        details: UploadDetails {
            success: result.success,
            processed: result.processed,
            errors: result.errors,
        },
    }))
}

pub async fn preview_schedule_upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<UploadPreviewResponse>, (axum::http::StatusCode, String)> {
    let _auth_user = authorize_admin(&headers, &state).await?;
    let bytes = extract_uploaded_file(&mut multipart).await?;

    let excel_service: Arc<ExcelService> = state.excel_service.clone();
    let result = excel_service
        .preview_schedule_file(&bytes)
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.msg()))?;

    Ok(Json(UploadPreviewResponse {
        message: "Previsualizacion completada".to_string(),
        details: result,
    }))
}

async fn authorize_admin(
    headers: &HeaderMap,
    state: &AppState,
) -> Result<AuthUser, (axum::http::StatusCode, String)> {
    let auth_user =
        read_active_auth_user_from_headers(&headers, &state.config, state.user_repo.clone())
            .await
            .ok_or((
                axum::http::StatusCode::UNAUTHORIZED,
                "No autorizado".to_string(),
            ))?;

    if !auth_user.is_admin_horarios() {
        return Err((
            axum::http::StatusCode::FORBIDDEN,
            "Solo ADMIN_HORARIOS puede subir horarios".to_string(),
        ));
    }

    Ok(auth_user)
}

async fn extract_uploaded_file(
    multipart: &mut Multipart,
) -> Result<Vec<u8>, (axum::http::StatusCode, String)> {
    let mut file_bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        tracing::error!("Error leyendo multipart: {e}");
        (
            axum::http::StatusCode::BAD_REQUEST,
            format!("Multipart inválido: {e}"),
        )
    })? {
        if field.name() == Some("file") {
            let data = field.bytes().await.map_err(|e| {
                tracing::error!("Error leyendo bytes del archivo: {e}");
                (
                    axum::http::StatusCode::BAD_REQUEST,
                    format!("Archivo inválido: {e}"),
                )
            })?;
            file_bytes = Some(data.to_vec());
            break;
        }
    }

    file_bytes.ok_or((
        axum::http::StatusCode::BAD_REQUEST,
        "No se subio ningun archivo".to_string(),
    ))
}
