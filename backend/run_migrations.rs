#[tokio::main]
async fn main() {
    let pool = sqlx::PgPool::connect("postgres://postgres:root@localhost:5432/edusync_db").await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
}
