use sqlx::PgPool;
use backend::domain::services::excel_service::ExcelService;
use std::fs;

#[tokio::main]
async fn main() {
    let pool = PgPool::connect("postgres://postgres:postgres@localhost/edusync").await.unwrap_or_else(|_| panic!("Failed to connect to PG"));
    let excel_service = ExcelService::new(pool);
    for file in &["../test-data/horarios_prueba.csv", "../test-data/horarios_prueba_errores.csv", "../test-data/horarios_prueba.xlsx"] {
        println!("Testing {}...", file);
        match fs::read(file) {
            Ok(bytes) => {
                match excel_service.preview_schedule_file(&bytes).await {
                    Ok(result) => println!("Success: {} processed, {} errors", result.processed, result.errors.len()),
                    Err(e) => println!("Error: {:?}", e),
                }
            },
            Err(e) => println!("Failed to read file: {:?}", e),
        }
    }
}
