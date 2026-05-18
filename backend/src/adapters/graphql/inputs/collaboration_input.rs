use async_graphql::InputObject;

/// Datos para compartir una tarea con compañeros (RQF-APP-45).
#[derive(InputObject, Clone)]
pub struct ShareTaskInput {
    /// Contenido de la tarea cifrado con AES-256 (Base64).
    pub ciphertext: String,
    /// Clave AES-256 de esta tarea compartida (Base64).
    pub enc_key: String,
    /// `GROUP` (todo el grupo) o `SELECTED` (compañeros elegidos).
    pub scope: String,
    /// Título en claro para previsualizar la tarea en la bandeja.
    pub title_preview: String,
    /// Ids (UUID) de los compañeros destinatarios.
    pub recipient_ids: Vec<String>,
}

/// Respuesta del destinatario a una tarea compartida (RQF-APP-46).
#[derive(InputObject, Clone)]
pub struct RespondSharedTaskInput {
    pub shared_task_id: String,
    pub accept: bool,
}

/// Envío de un recordatorio (toque) sobre una tarea compartida (RQF-APP-47).
#[derive(InputObject, Clone)]
pub struct SendTaskReminderInput {
    pub shared_task_id: String,
    pub recipient_id: String,
}

/// Publicación del grupo/subgrupo del alumno (RQNF-APP-43).
#[derive(InputObject, Clone)]
pub struct AcademicProfileInput {
    pub group_id: Option<i32>,
    pub subgroup_id: Option<i32>,
}
