use super::errors::DomainError;

pub fn normalize_required_text(field_name: &str, value: &str) -> Result<String, DomainError> {
    let normalized = value.trim();

    if normalized.is_empty() {
        return Err(DomainError::BadRequest(format!("El campo {field_name} es requerido")));
    }

    Ok(normalized.to_string())
}

pub fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value.map(str::trim).filter(|text| !text.is_empty()).map(ToString::to_string)
}