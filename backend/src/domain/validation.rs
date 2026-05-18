use super::errors::DomainError;

pub fn normalize_required_text(field_name: &str, value: &str) -> Result<String, DomainError> {
    let normalized = value.trim();

    if normalized.is_empty() {
        return Err(DomainError::BadRequest(format!(
            "El campo {field_name} es requerido"
        )));
    }

    Ok(normalized.to_string())
}

pub fn normalize_email(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub fn normalize_optional_email(value: Option<&str>) -> Option<String> {
    value.map(normalize_email).filter(|text| !text.is_empty())
}

pub fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToString::to_string)
}

/// Normaliza y valida un nombre de usuario: minúsculas, 3-30 caracteres,
/// solo letras ASCII, dígitos, punto y guion bajo. Devuelve el valor saneado.
pub fn normalize_username(value: &str) -> Result<String, DomainError> {
    let normalized = value.trim().to_ascii_lowercase();
    let valid_len = (3..=30).contains(&normalized.chars().count());
    let valid_chars = normalized
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '_');
    if !valid_len || !valid_chars {
        return Err(DomainError::BadRequest(
            "El nombre de usuario debe tener entre 3 y 30 caracteres y solo puede incluir letras, números, punto y guion bajo".to_string(),
        ));
    }
    Ok(normalized)
}

/// Deriva un nombre de usuario base a partir de un correo (parte local
/// saneada). Se usa para las cuentas administrativas, que no eligen username.
pub fn username_from_email(email: &str) -> String {
    let local = email.split('@').next().unwrap_or("usuario");
    let cleaned: String = local
        .to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '.' || *c == '_')
        .collect();
    let trimmed = cleaned.trim_matches(|c| c == '.' || c == '_');
    let base = if trimmed.chars().count() < 3 {
        format!("user_{trimmed}")
    } else {
        trimmed.to_string()
    };
    base.chars().take(40).collect()
}
