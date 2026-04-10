use async_trait::async_trait;
use reqwest::Client;
use serde::Serialize;

use crate::domain::{
    errors::DomainError,
    ports::email_sender::{EmailMessage, EmailSender},
};

const BREVO_EMAIL_ENDPOINT: &str = "https://api.brevo.com/v3/smtp/email";

#[derive(Clone)]
pub struct BrevoEmailSender {
    client: Client,
    api_key: String,
    sender_email: String,
    sender_name: String,
}

impl BrevoEmailSender {
    pub fn new(api_key: String, sender_email: String, sender_name: String) -> Self {
        Self {
            client: Client::new(),
            api_key: api_key.trim().to_string(),
            sender_email: sender_email.trim().to_string(),
            sender_name: sender_name.trim().to_string(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrevoEmailRequest {
    sender: BrevoSender,
    to: Vec<BrevoRecipient>,
    subject: String,
    text_content: String,
    html_content: String,
}

#[derive(Serialize)]
struct BrevoSender {
    email: String,
    name: String,
}

#[derive(Serialize)]
struct BrevoRecipient {
    email: String,
    name: String,
}

#[async_trait]
impl EmailSender for BrevoEmailSender {
    async fn send(&self, message: EmailMessage) -> Result<(), DomainError> {
        let EmailMessage {
            to_email,
            to_name,
            subject,
            text_content,
            html_content,
        } = message;

        if self.api_key.is_empty() {
            return Err(DomainError::Internal(
                "Brevo no está configurado: falta BREVO_API_KEY".to_string(),
            ));
        }

        if self.sender_email.is_empty() {
            return Err(DomainError::Internal(
                "Brevo no está configurado: falta BREVO_SENDER_EMAIL".to_string(),
            ));
        }

        let sender_name = if self.sender_name.is_empty() {
            self.sender_email.clone()
        } else {
            self.sender_name.clone()
        };

        let recipient_name = to_name
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| to_email.clone());

        let html_content = html_content.unwrap_or_else(|| text_content.clone());

        let payload = BrevoEmailRequest {
            sender: BrevoSender {
                email: self.sender_email.clone(),
                name: sender_name,
            },
            to: vec![BrevoRecipient {
                email: to_email.clone(),
                name: recipient_name,
            }],
            subject,
            text_content,
            html_content,
        };

        let response = self
            .client
            .post(BREVO_EMAIL_ENDPOINT)
            .header("api-key", self.api_key.as_str())
            .json(&payload)
            .send()
            .await
            .map_err(|error| DomainError::Internal(format!("No se pudo conectar con Brevo: {error}")))?;

        let status = response.status();
        if !status.is_success() {
            let response_body = response.text().await.unwrap_or_default();
            return Err(DomainError::Internal(format!(
                "Brevo respondió con estado {status}: {response_body}"
            )));
        }

        Ok(())
    }
}