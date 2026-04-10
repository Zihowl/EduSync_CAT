use async_trait::async_trait;

use crate::domain::errors::DomainError;

#[derive(Clone, Debug)]
pub struct EmailMessage {
    pub to_email: String,
    pub to_name: Option<String>,
    pub subject: String,
    pub text_content: String,
    pub html_content: Option<String>,
}

#[async_trait]
pub trait EmailSender: Send + Sync {
    async fn send(&self, message: EmailMessage) -> Result<(), DomainError>;
}
