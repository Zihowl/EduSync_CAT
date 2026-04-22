mod adapters;
mod config;
mod domain;
mod infrastructure;

use std::{net::SocketAddr, sync::Arc};

use adapters::{
    auth::middleware::read_active_auth_user_from_headers,
    graphql::{
        realtime::RealtimeBroadcaster,
        schema::{build_schema, AppSchema},
    },
    rest::{
        public_schedules,
        upload_handler::{preview_schedule_upload, upload_schedule},
    },
};
use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use async_graphql::http::{playground_source, GraphQLPlaygroundConfig};
use async_graphql_axum::{GraphQLRequest, GraphQLResponse, GraphQLSubscription};
use axum::{
    extract::State,
    http::HeaderValue,
    response::{Html, IntoResponse},
    routing::{get, get_service, post},
    Extension, Router,
};
use config::AppConfig;
use domain::{
    ports::{
        allowed_domain_repository::AllowedDomainRepository,
        audit_log_repository::AuditLogRepository, building_repository::BuildingRepository,
        classroom_repository::ClassroomRepository, group_repository::GroupRepository,
        schedule_slot_repository::ScheduleSlotRepository,
        school_year_repository::SchoolYearRepository, subject_repository::SubjectRepository,
        teacher_repository::TeacherRepository, user_repository::UserRepository,
    },
    services::{
        auth_service::AuthService, building_service::BuildingService,
        classroom_service::ClassroomService, config_service::ConfigService,
        excel_service::ExcelService, group_service::GroupService,
        schedule_service::ScheduleService, subject_service::SubjectService,
        teacher_service::TeacherService, user_service::UserService,
    },
};
use infrastructure::email::brevo_sender::BrevoEmailSender;
use infrastructure::persistence::{
    pg_allowed_domain_repo::PgAllowedDomainRepository, pg_audit_log_repo::PgAuditLogRepository,
    pg_building_repo::PgBuildingRepository, pg_classroom_repo::PgClassroomRepository,
    pg_group_repo::PgGroupRepository, pg_schedule_slot_repo::PgScheduleSlotRepository,
    pg_school_year_repo::PgSchoolYearRepository, pg_subject_repo::PgSubjectRepository,
    pg_teacher_repo::PgTeacherRepository, pg_user_repo::PgUserRepository,
};
use rand::prelude::{IndexedRandom, SliceRandom};
use rand::RngExt;
use sqlx::PgPool;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<AppConfig>,
    pub user_repo: Arc<dyn UserRepository>,
    pub schema: AppSchema,
    pub realtime: Arc<RealtimeBroadcaster>,
    pub teacher_service: Arc<TeacherService>,
    pub subject_service: Arc<SubjectService>,
    pub classroom_service: Arc<ClassroomService>,
    pub group_service: Arc<GroupService>,
    pub schedule_service: Arc<ScheduleService>,
    pub excel_service: Arc<ExcelService>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let config = Arc::new(AppConfig::from_env());
    let pool = PgPool::connect(&config.database_url).await?;

    sqlx::migrate!("./migrations").run(&pool).await?;

    let user_repo: Arc<dyn UserRepository> = Arc::new(PgUserRepository::new(pool.clone()));
    let allowed_domain_repo: Arc<dyn AllowedDomainRepository> =
        Arc::new(PgAllowedDomainRepository::new(pool.clone()));
    let audit_log_repo: Arc<dyn AuditLogRepository> =
        Arc::new(PgAuditLogRepository::new(pool.clone()));
    let school_year_repo: Arc<dyn SchoolYearRepository> =
        Arc::new(PgSchoolYearRepository::new(pool.clone()));
    let teacher_repo: Arc<dyn TeacherRepository> = Arc::new(PgTeacherRepository::new(pool.clone()));
    let subject_repo: Arc<dyn SubjectRepository> = Arc::new(PgSubjectRepository::new(pool.clone()));
    let building_repo: Arc<dyn BuildingRepository> =
        Arc::new(PgBuildingRepository::new(pool.clone()));
    let classroom_repo: Arc<dyn ClassroomRepository> =
        Arc::new(PgClassroomRepository::new(pool.clone()));
    let group_repo: Arc<dyn GroupRepository> = Arc::new(PgGroupRepository::new(pool.clone()));
    let schedule_repo: Arc<dyn ScheduleSlotRepository> =
        Arc::new(PgScheduleSlotRepository::new(pool.clone()));

    genesis_protocol(user_repo.clone()).await?;

    if config.brevo_api_key.trim().is_empty() || config.brevo_sender_email.trim().is_empty() {
        tracing::warn!(
            "Brevo no está configurado por completo. La simulación por terminal seguirá activa, pero el correo real fallará hasta completar BREVO_API_KEY y BREVO_SENDER_EMAIL."
        );
    }

    let brevo_email_sender = Arc::new(BrevoEmailSender::new(
        config.brevo_api_key.clone(),
        config.brevo_sender_email.clone(),
        config.brevo_sender_name.clone(),
    ));

    let user_service = Arc::new(UserService::new(
        user_repo.clone(),
        allowed_domain_repo.clone(),
        brevo_email_sender,
    ));
    let auth_service = Arc::new(AuthService::new(
        user_repo.clone(),
        config.jwt_secret.clone(),
        config.jwt_expires_in_secs,
    ));
    let config_service = Arc::new(ConfigService::new(
        allowed_domain_repo.clone(),
        user_repo.clone(),
        school_year_repo.clone(),
    ));
    let teacher_service = Arc::new(TeacherService::new(
        teacher_repo.clone(),
        allowed_domain_repo.clone(),
    ));
    let subject_service = Arc::new(SubjectService::new(subject_repo.clone()));
    let building_service = Arc::new(BuildingService::new(building_repo.clone()));
    let classroom_service = Arc::new(ClassroomService::new(classroom_repo.clone()));
    let group_service = Arc::new(GroupService::new(group_repo.clone()));
    let schedule_service = Arc::new(ScheduleService::new(
        schedule_repo.clone(),
        teacher_repo.clone(),
        subject_repo.clone(),
        classroom_repo.clone(),
        group_repo.clone(),
    ));
    let excel_service = Arc::new(ExcelService::new(
        teacher_service.clone(),
        subject_service.clone(),
        building_service.clone(),
        classroom_service.clone(),
        group_service.clone(),
        schedule_service.clone(),
    ));
    let realtime = Arc::new(RealtimeBroadcaster::new());

    spawn_audit_retention_task(audit_log_repo.clone());

    let schema = build_schema()
        .data(auth_service.clone())
        .data(user_service.clone())
        .data(config_service.clone())
        .data(audit_log_repo.clone())
        .data(teacher_service.clone())
        .data(subject_service.clone())
        .data(building_service.clone())
        .data(classroom_service.clone())
        .data(group_service.clone())
        .data(schedule_service.clone())
        .data(config.clone())
        .data(realtime.clone())
        .finish();

    let state = AppState {
        config: config.clone(),
        user_repo: user_repo.clone(),
        schema,
        realtime,
        teacher_service: teacher_service.clone(),
        subject_service: subject_service.clone(),
        classroom_service: classroom_service.clone(),
        group_service: group_service.clone(),
        schedule_service,
        excel_service,
    };

    let cors = build_cors_layer(&config.cors_origin)?;

    let app = Router::new()
        .route("/graphql", post(graphql_handler).get(graphql_playground))
        .route(
            "/graphql/ws",
            get_service(GraphQLSubscription::new(state.schema.clone())),
        )
        .route("/api/academic/upload-schedule", post(upload_schedule))
        .route(
            "/api/academic/upload-schedule/preview",
            post(preview_schedule_upload),
        )
        .route("/api/public/schedules", get(public_schedules))
        .layer(Extension(config.clone()))
        .layer(cors)
        .with_state(state);

    let addr: SocketAddr = format!("{}:{}", config.app_host, config.app_port).parse()?;
    tracing::info!("Backend Rust escuchando en http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn graphql_handler(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    req: GraphQLRequest,
) -> GraphQLResponse {
    let mut request = req.into_inner();
    if let Some(auth_user) =
        read_active_auth_user_from_headers(&headers, &state.config, state.user_repo.clone()).await
    {
        request = request.data(auth_user);
    }

    state.schema.execute(request).await.into()
}

async fn graphql_playground() -> impl IntoResponse {
    Html(playground_source(GraphQLPlaygroundConfig::new("/graphql")))
}

// Checa si la base de datos tiene usuarios. Si no tiene, o si solo tiene un usuario
// con email @setup.local, genera credenciales de súper administrador y las muestra
// en consola.
async fn genesis_protocol(user_repo: Arc<dyn UserRepository>) -> anyhow::Result<()> {
    let users = user_repo.find_all().await.map_err(anyhow::Error::msg)?;

    let mut replace_existing_user_id: Option<uuid::Uuid> = None;

    if users.is_empty() {
        tracing::warn!("Base de datos vacía. Iniciando Protocolo Génesis...");
    } else if users.len() == 1 && users[0].email.ends_with("@setup.local") {
        tracing::warn!("Unico usuario setup.local detectado. Regenerando credenciales...");
        replace_existing_user_id = Some(users[0].id);
    } else {
        tracing::warn!("Protocolo Génesis ya ejecutado: No se necesita regenerar.");
        return Ok(());
    }

    // Random generator instance
    let mut rng = rand::rng();

    // Generate credentials once and hash password
    let email = generate_genesis_email(&mut rng);
    let password = generate_genesis_password(&mut rng);
    let hash = hash_password(&password)?;

    if let Some(user_id) = replace_existing_user_id {
        user_repo
            .update_credentials(user_id, &email, &hash, true)
            .await
            .map_err(anyhow::Error::msg)?;
        tracing::warn!("Protocolo Génesis: Usuario existente setup.local actualizado.");
    } else {
        user_repo
            .create_admin(&email, "Súper Administrador", &hash, true)
            .await
            .map_err(anyhow::Error::msg)?;
        tracing::warn!("Protocolo Génesis: Súper Administrador creado.");
    }

    // Print credentials in formatted output
    println!("=============================================");
    println!(" CREDENCIALES DE SÚPER ADMINISTRADOR");
    println!("=============================================");
    println!(" Correo:    {}", email);
    println!(" Contraseña: {}", password);
    println!("=============================================");

    tracing::warn!("Protocolo Génesis completado. Las credenciales son válidas para uso único.");

    Ok(())
}

fn generate_genesis_email(rng: &mut impl rand::Rng) -> String {
    let random_hex: String = (0..8)
        .map(|_| format!("{:x}", rng.random_range(0..16)))
        .collect();
    format!("admin-{}@setup.local", random_hex)
}

fn generate_genesis_password(rng: &mut impl rand::Rng) -> String {
    let uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".chars().collect::<Vec<_>>();
    let lowercase = "abcdefghijklmnopqrstuvwxyz".chars().collect::<Vec<_>>();
    let numbers = "0123456789".chars().collect::<Vec<_>>();
    let symbols = "!@#$%^&*()-_=+[]{}<>?".chars().collect::<Vec<_>>();

    let mut password_chars = vec![
        *uppercase.choose(rng).unwrap_or(&'A'),
        *lowercase.choose(rng).unwrap_or(&'a'),
        *numbers.choose(rng).unwrap_or(&'0'),
        *symbols.choose(rng).unwrap_or(&'!'),
    ];

    let mut all_chars: Vec<char> = uppercase;
    all_chars.extend(lowercase);
    all_chars.extend(numbers);
    all_chars.extend(symbols);

    for _ in 4..32 {
        password_chars.push(*all_chars.choose(rng).unwrap());
    }

    password_chars.shuffle(rng);
    password_chars.iter().collect()
}

fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut argon2::password_hash::rand_core::OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| {
            anyhow::Error::msg(format!(
                "Error al generar el hash de la contraseña de Génesis: {e}"
            ))
        })
}

fn build_cors_layer(cors_origin: &str) -> anyhow::Result<CorsLayer> {
    let mut layer = CorsLayer::new().allow_headers(Any).allow_methods(Any);

    if cors_origin.trim() == "*" {
        return Ok(layer.allow_origin(Any));
    }

    let origins: Vec<HeaderValue> = cors_origin
        .split(',')
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|origin| origin.parse::<HeaderValue>())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| anyhow::Error::msg(format!("Valor de CORS_ORIGIN inválido: {e}")))?;

    if origins.is_empty() {
        return Err(anyhow::Error::msg(
            "CORS_ORIGIN está vacío. Usa '*' o uno o más orígenes separados por comas.",
        ));
    }

    layer = layer.allow_origin(origins);
    Ok(layer)
}

fn spawn_audit_retention_task(audit_repo: Arc<dyn AuditLogRepository>) {
    tokio::spawn(async move {
        const RETENTION_MONTHS: i32 = 12;
        const RETENTION_INTERVAL_SECS: u64 = 60 * 60 * 24;

        if let Err(err) = audit_repo.delete_older_than_months(RETENTION_MONTHS).await {
            tracing::warn!(error = %err, months = RETENTION_MONTHS, "AUDITORÍA: limpieza inicial de retención fallida");
        }

        let mut interval =
            tokio::time::interval(std::time::Duration::from_secs(RETENTION_INTERVAL_SECS));

        loop {
            interval.tick().await;

            match audit_repo.delete_older_than_months(RETENTION_MONTHS).await {
                Ok(removed) => {
                    tracing::info!(
                        removed,
                        months = RETENTION_MONTHS,
                        "AUDITORÍA: limpieza de retención completada"
                    );
                }
                Err(err) => {
                    tracing::warn!(error = %err, months = RETENTION_MONTHS, "AUDITORÍA: limpieza de retención fallida");
                }
            }
        }
    });
}
