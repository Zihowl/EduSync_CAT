use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub app_host: String,
    pub app_port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expires_in_secs: i64,
    pub cors_origin: String,
    pub brevo_api_key: String,
    pub brevo_sender_email: String,
    pub brevo_sender_name: String,
    pub genesis_super_admin_email: String,
    pub genesis_super_admin_password: String,
    pub genesis_super_admin_name: String,
    /// Ruta al Service Account JSON de Firebase (vacío = push deshabilitado).
    pub fcm_service_account_path: String,
    /// Override del project_id de Firebase. Si está vacío se usa el del JSON.
    pub fcm_project_id: String,
    /// Máximo de conexiones concurrentes en el pool de PostgreSQL.
    pub db_max_connections: u32,
    /// Mínimo de conexiones inactivas en el pool de PostgreSQL.
    pub db_min_connections: u32,
    /// Verificar la conexión con un ping antes de prestarla del pool.
    pub db_test_before_acquire: bool,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let app_port = env::var("APP_PORT")
            .ok()
            .and_then(|v| v.parse::<u16>().ok())
            .unwrap_or(3000);
        let jwt_expires_in_secs = env::var("JWT_EXPIRES_IN_SECS")
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(86_400);

        let db_max_connections = env::var("DB_MAX_CONNECTIONS")
            .or_else(|_| env::var("DATABASE_MAX_CONNECTIONS"))
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(50);
        let db_min_connections = env::var("DB_MIN_CONNECTIONS")
            .or_else(|_| env::var("DATABASE_MIN_CONNECTIONS"))
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(5);
        let db_test_before_acquire = env::var("DB_TEST_BEFORE_ACQUIRE")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        Self {
            app_host: env::var("APP_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            app_port,
            database_url: env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgres://postgres:postgres@localhost:5432/edusync_db".to_string()
            }),
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| "SUPER_SECRET_KEY_DEV_ONLY".to_string()),
            jwt_expires_in_secs,
            cors_origin: env::var("CORS_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:8100".to_string()),
            brevo_api_key: env::var("BREVO_API_KEY").unwrap_or_default(),
            brevo_sender_email: env::var("BREVO_SENDER_EMAIL").unwrap_or_default(),
            brevo_sender_name: Self::read_brevo_sender_name(),
            genesis_super_admin_email: env::var("GENESIS_SUPER_ADMIN_EMAIL")
                .unwrap_or_else(|_| "superadmin@edusync.edu.mx".to_string()),
            genesis_super_admin_password: env::var("GENESIS_SUPER_ADMIN_PASSWORD")
                .unwrap_or_else(|_| "ChangeMe123!".to_string()),
            genesis_super_admin_name: env::var("GENESIS_SUPER_ADMIN_NAME")
                .unwrap_or_else(|_| "Súper Administrador".to_string()),
            fcm_service_account_path: env::var("FCM_SERVICE_ACCOUNT_PATH").unwrap_or_default(),
            fcm_project_id: env::var("FCM_PROJECT_ID").unwrap_or_default(),
            db_max_connections,
            db_min_connections,
            db_test_before_acquire,
        }
    }

    fn read_brevo_sender_name() -> String {
        match env::var("BREVO_SENDER_NAME") {
            Ok(value) => {
                let trimmed = value.trim();
                if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("edusync") {
                    "Zihowl Email Services".to_string()
                } else {
                    trimmed.to_string()
                }
            }
            Err(_) => "Zihowl Email Services".to_string(),
        }
    }
}
