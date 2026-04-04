use std::sync::Arc;

use axum::{
    extract::{Multipart, State},
    http::HeaderMap,
    Json,
};
use serde::Serialize;

use crate::{
    adapters::{
        auth::middleware::read_auth_user_from_headers,
        graphql::realtime::RealtimeScope,
    },
    domain::services::excel_service::ExcelService,
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

pub async fn upload_schedule(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>, (axum::http::StatusCode, String)> {
    let auth_user = read_auth_user_from_headers(&headers, &state.config).ok_or((
        axum::http::StatusCode::UNAUTHORIZED,
        "Unauthorized".to_string(),
    ))?;

    if !auth_user.is_admin_horarios() {
        return Err((
            axum::http::StatusCode::FORBIDDEN,
            "Solo ADMIN_HORARIOS puede subir horarios".to_string(),
        ));
    }

    let mut file_bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, format!("Multipart invalido: {e}")))?
    {
        if field.name() == Some("file") {
            let data = field
                .bytes()
                .await
                .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, format!("Archivo invalido: {e}")))?;
            file_bytes = Some(data.to_vec());
            break;
        }
    }

    let bytes = file_bytes.ok_or((
        axum::http::StatusCode::BAD_REQUEST,
        "No se subio ningun archivo".to_string(),
    ))?;

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
