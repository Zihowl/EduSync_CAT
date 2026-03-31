# EduSync Backend Rust (Axum + Hexagonal)

Migracion inicial del backend NestJS a Rust usando Axum, async-graphql y SQLx, sin eliminar el backend original en `backend/`.

## Stack

- axum 0.8
- async-graphql 7
- sqlx 0.8
- jsonwebtoken
- argon2
- calamine
- dotenvy
- tracing

## Estructura

- `src/domain`: core de negocio (modelos, puertos, servicios)
- `src/infrastructure/persistence`: implementaciones SQLx de puertos
- `src/adapters/graphql`: schema, queries, mutations, DTOs GQL
- `src/adapters/rest`: upload de excel y endpoint publico
- `src/adapters/auth`: JWT y helpers de autorizacion
- `migrations`: migraciones SQL de las 9 tablas

## Variables de entorno

Ver archivo `.env`:

- `APP_HOST`
- `APP_PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN_SECS`
- `CORS_ORIGIN`
- `GENESIS_SUPER_ADMIN_EMAIL`
- `GENESIS_SUPER_ADMIN_PASSWORD`
- `GENESIS_SUPER_ADMIN_NAME`

`CORS_ORIGIN` admite:
- Un origen: `http://localhost:8100`
- Varios orígenes separados por coma: `http://localhost:8100,http://127.0.0.1:8100`
- Todos los orígenes (solo desarrollo): `*`

## Ejecutar

```bash
cd backend-rs
cargo build
cargo run
```

## Flujo recomendado en desarrollo (evita conflicto de puerto)

Usa estos scripts para evitar el error `Address already in use` cuando queda una instancia previa corriendo.

```bash
cd backend-rs
./scripts/dev-up.sh
```

Para detener la instancia actual:

```bash
cd backend-rs
./scripts/dev-stop.sh
```

Para ver las credenciales temporales actuales del super admin:

```bash
cd backend-rs
./scripts/show-genesis-credentials.sh
```

Notas:
- Ambos scripts usan `APP_PORT` (por defecto `3000`).
- `dev-up.sh` detecta procesos en ese puerto, los detiene y luego ejecuta `cargo run`.

## Endpoints

- `POST /graphql`
- `GET /graphql` (Playground)
- `POST /academic/upload-schedule`
- `GET /public/schedules`

## Notas

- Al iniciar, se ejecutan migraciones SQLx (`sqlx::migrate!`).
- Si no hay usuarios, corre Genesis Protocol y crea el super admin.
- Las credenciales temporales generadas se guardan en `.genesis-super-admin.json`.
- El backend NestJS permanece intacto en `backend/`.
