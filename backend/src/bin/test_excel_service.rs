use std::sync::Arc;

use backend::domain::services::{
    building_service::BuildingService, classroom_service::ClassroomService,
    excel_service::ExcelService, group_service::GroupService,
    schedule_service::ScheduleService, subject_service::SubjectService,
    teacher_service::TeacherService,
};
use backend::infrastructure::persistence::{
    pg_building_repo::PgBuildingRepository, pg_classroom_repo::PgClassroomRepository,
    pg_group_repo::PgGroupRepository, pg_schedule_slot_repo::PgScheduleSlotRepository,
    pg_subject_repo::PgSubjectRepository, pg_teacher_repo::PgTeacherRepository,
};
use sqlx::PgPool;
use std::fs;

#[tokio::main]
async fn main() {
    let url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost/edusync".to_string());
    let pool = PgPool::connect(&url)
        .await
        .expect("Failed to connect to PG");

    let teacher_repo = Arc::new(PgTeacherRepository::new(pool.clone()));
    let subject_repo = Arc::new(PgSubjectRepository::new(pool.clone()));
    let building_repo = Arc::new(PgBuildingRepository::new(pool.clone()));
    let classroom_repo = Arc::new(PgClassroomRepository::new(pool.clone()));
    let group_repo = Arc::new(PgGroupRepository::new(pool.clone()));
    let schedule_repo = Arc::new(PgScheduleSlotRepository::new(pool.clone()));

    // TeacherService takes (teacher_repo, allowed_domain_repo); the parser path
    // doesn't touch domains so a stub repo isn't needed if we wire teachers via
    // its public API only. For this smoke-test we skip TeacherService and call
    // through ExcelService::preview_schedule_file which only needs find_all on
    // the inner services.
    let _ = (teacher_repo, subject_repo, building_repo, classroom_repo, group_repo, schedule_repo);

    // Build a minimal service graph mirroring main.rs without the email/auth deps.
    use backend::infrastructure::persistence::pg_allowed_domain_repo::PgAllowedDomainRepository;
    let allowed_domain_repo = Arc::new(PgAllowedDomainRepository::new(pool.clone()));

    let teacher_service = Arc::new(TeacherService::new(
        Arc::new(PgTeacherRepository::new(pool.clone())),
        allowed_domain_repo.clone(),
    ));
    let subject_service = Arc::new(SubjectService::new(Arc::new(
        PgSubjectRepository::new(pool.clone()),
    )));
    let building_service = Arc::new(BuildingService::new(Arc::new(
        PgBuildingRepository::new(pool.clone()),
    )));
    let classroom_service = Arc::new(ClassroomService::new(Arc::new(
        PgClassroomRepository::new(pool.clone()),
    )));
    let group_service = Arc::new(GroupService::new(Arc::new(PgGroupRepository::new(
        pool.clone(),
    ))));
    let schedule_service = Arc::new(ScheduleService::new(
        Arc::new(PgScheduleSlotRepository::new(pool.clone())),
        Arc::new(PgTeacherRepository::new(pool.clone())),
        Arc::new(PgSubjectRepository::new(pool.clone())),
        Arc::new(PgClassroomRepository::new(pool.clone())),
        Arc::new(PgGroupRepository::new(pool.clone())),
    ));
    let excel_service = ExcelService::new(
        teacher_service,
        subject_service,
        building_service,
        classroom_service,
        group_service,
        schedule_service,
    );

    for file in &[
        "../test-data/horarios_prueba.csv",
        "../test-data/horarios_prueba_errores.csv",
        "../test-data/horarios_prueba.xlsx",
    ] {
        println!("Testing {}...", file);
        match fs::read(file) {
            Ok(bytes) => match excel_service.preview_schedule_file(&bytes).await {
                Ok(result) => println!(
                    "Success: {} processed, {} errors",
                    result.processed,
                    result.errors.len()
                ),
                Err(e) => println!("Error: {:?}", e),
            },
            Err(e) => println!("Failed to read file: {:?}", e),
        }
    }
}
