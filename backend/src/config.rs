use std::env;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub app_host: String,
    pub app_port: u16,
    pub database_url: String,
    pub jwt_secret: String,
    pub jwt_expires_in_secs: i64,
    pub cors_origin: String,
    pub genesis_super_admin_email: String,
    pub genesis_super_admin_password: String,
    pub genesis_super_admin_name: String,
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

        Self {
            app_host: env::var("APP_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            app_port,
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/edusync_db".to_string()),
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "SUPER_SECRET_KEY_DEV_ONLY".to_string()),
            jwt_expires_in_secs,
            cors_origin: env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:8100".to_string()),
            genesis_super_admin_email: env::var("GENESIS_SUPER_ADMIN_EMAIL")
                .unwrap_or_else(|_| "superadmin@edusync.edu.mx".to_string()),
            genesis_super_admin_password: env::var("GENESIS_SUPER_ADMIN_PASSWORD")
                .unwrap_or_else(|_| "ChangeMe123!".to_string()),
            genesis_super_admin_name: env::var("GENESIS_SUPER_ADMIN_NAME")
                .unwrap_or_else(|_| "Super Administrador".to_string()),
        }
    }
}
