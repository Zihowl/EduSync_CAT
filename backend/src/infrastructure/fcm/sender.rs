use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use async_trait::async_trait;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::Mutex;

use crate::domain::ports::notification_sender::{
    NotificationError, NotificationSender, PushMessage,
};

/// Implementación productiva del puerto `NotificationSender` contra Firebase
/// Cloud Messaging (HTTP v1). Lee un Service Account JSON, firma JWTs con
/// RS256 vía `jsonwebtoken`, intercambia por access tokens OAuth2 y envía
/// pushes data-only a `/messages:send`.
///
/// El cliente Android decide cómo mostrar el push: el backend solo emite la
/// señal. Los errores **no** se propagan al GraphQL: la durabilidad la da la
/// tabla `notification_events`.
#[derive(Clone)]
pub struct FcmSender {
    project_id: String,
    client_email: String,
    private_key_pem: Vec<u8>,
    token_uri: String,
    http: Client,
    cache: Arc<Mutex<TokenCache>>,
}

#[derive(Default)]
struct TokenCache {
    access_token: String,
    expires_at: Option<Instant>,
}

#[derive(Deserialize)]
struct ServiceAccountFile {
    project_id: String,
    private_key: String,
    client_email: String,
    #[serde(default = "default_token_uri")]
    token_uri: String,
}

fn default_token_uri() -> String {
    "https://oauth2.googleapis.com/token".to_string()
}

#[derive(Serialize)]
struct JwtClaims {
    iss: String,
    scope: String,
    aud: String,
    iat: u64,
    exp: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct FcmErrorEnvelope {
    error: Option<FcmError>,
}

#[derive(Deserialize)]
struct FcmError {
    #[serde(default)]
    status: String,
    #[serde(default)]
    #[allow(dead_code)] // útil para diagnóstico al ampliar el log
    message: String,
}

impl FcmSender {
    /// Construye el sender leyendo el Service Account JSON desde disco. Si la
    /// ruta no existe o el archivo es inválido, devuelve `Err` para que
    /// `main.rs` registre el warning y siga arrancando sin push.
    pub fn from_service_account_file(
        path: &str,
        project_id_override: Option<&str>,
    ) -> anyhow::Result<Self> {
        let raw = std::fs::read_to_string(path)
            .map_err(|e| anyhow::anyhow!("No se pudo leer el Service Account FCM ({path}): {e}"))?;
        let file: ServiceAccountFile = serde_json::from_str(&raw)
            .map_err(|e| anyhow::anyhow!("Service Account FCM inválido: {e}"))?;
        let project_id = project_id_override
            .map(|s| s.to_string())
            .unwrap_or(file.project_id);
        Ok(Self {
            project_id,
            client_email: file.client_email,
            private_key_pem: file.private_key.into_bytes(),
            token_uri: file.token_uri,
            http: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()?,
            cache: Arc::new(Mutex::new(TokenCache::default())),
        })
    }

    async fn access_token(&self) -> Result<String, NotificationError> {
        {
            let cache = self.cache.lock().await;
            if let Some(exp) = cache.expires_at {
                if exp > Instant::now() + Duration::from_secs(60) && !cache.access_token.is_empty()
                {
                    return Ok(cache.access_token.clone());
                }
            }
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let claims = JwtClaims {
            iss: self.client_email.clone(),
            scope: "https://www.googleapis.com/auth/firebase.messaging".to_string(),
            aud: self.token_uri.clone(),
            iat: now,
            exp: now + 3600,
        };
        let header = Header::new(Algorithm::RS256);
        let key = EncodingKey::from_rsa_pem(&self.private_key_pem)
            .map_err(|e| NotificationError::Auth(format!("clave privada inválida: {e}")))?;
        let assertion = encode(&header, &claims, &key)
            .map_err(|e| NotificationError::Auth(format!("no se pudo firmar JWT: {e}")))?;

        // Body application/x-www-form-urlencoded sin depender de reqwest::form (que
        // requiere serde_urlencoded como feature de reqwest).
        let body = format!(
            "grant_type={}&assertion={}",
            urlencode(
                "urn:ietf:params:oauth:grant-type:jwt-bearer"
            ),
            urlencode(&assertion)
        );
        let res = self
            .http
            .post(&self.token_uri)
            .header("content-type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|e| NotificationError::Transport(e.to_string()))?;

        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            return Err(NotificationError::Auth(format!(
                "OAuth2 status={status} body={body}"
            )));
        }

        let token: TokenResponse = res
            .json()
            .await
            .map_err(|e| NotificationError::Transport(e.to_string()))?;
        let expires_at = Instant::now() + Duration::from_secs(token.expires_in.saturating_sub(60));

        let mut cache = self.cache.lock().await;
        cache.access_token = token.access_token.clone();
        cache.expires_at = Some(expires_at);
        Ok(token.access_token)
    }
}

#[async_trait]
impl NotificationSender for FcmSender {
    async fn send(&self, message: PushMessage) -> Result<bool, NotificationError> {
        let access_token = self.access_token().await?;

        // FCM HTTP v1 exige que todos los valores de `data` sean strings.
        let mut data_map = serde_json::Map::new();
        data_map.insert("type".to_string(), json!(message.event_type));
        if let serde_json::Value::Object(obj) = &message.data {
            for (k, v) in obj {
                let v_str = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                data_map.insert(k.clone(), json!(v_str));
            }
        }

        let body = json!({
            "message": {
                "token": message.token,
                "data": data_map,
                "android": {
                    "priority": "HIGH",
                    "ttl": "86400s"
                }
            }
        });

        let url = format!(
            "https://fcm.googleapis.com/v1/projects/{}/messages:send",
            self.project_id
        );
        let res = self
            .http
            .post(&url)
            .bearer_auth(access_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| NotificationError::Transport(e.to_string()))?;

        let status = res.status();
        if status.is_success() {
            return Ok(true);
        }
        let body_text = res.text().await.unwrap_or_default();
        let envelope: Result<FcmErrorEnvelope, _> = serde_json::from_str(&body_text);
        let fcm_status = envelope
            .ok()
            .and_then(|e| e.error.map(|err| err.status))
            .unwrap_or_default();
        if matches!(
            fcm_status.as_str(),
            "UNREGISTERED" | "NOT_FOUND" | "INVALID_ARGUMENT"
        ) {
            return Err(NotificationError::InvalidToken);
        }
        Err(NotificationError::Server(format!(
            "status={status} body={body_text}"
        )))
    }
}

/// `NotificationSender` no-op para cuando no hay Service Account configurado.
/// Permite que el resto de la aplicación funcione (`notification_events` ya
/// asegura la durabilidad) y que el cliente reciba los avisos al hacer
/// polling de respaldo.
#[derive(Default, Clone)]
pub struct NoopNotificationSender;

#[async_trait]
impl NotificationSender for NoopNotificationSender {
    async fn send(&self, _message: PushMessage) -> Result<bool, NotificationError> {
        Ok(true)
    }
}

/// Codifica un string para application/x-www-form-urlencoded. Cubre los
/// pocos caracteres que aparecen en JWTs base64url y la URL de Google.
fn urlencode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.as_bytes() {
        let c = *byte as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            out.push_str(&format!("%{:02X}", byte));
        }
    }
    out
}
