# EduSync - Proyecto de Egreso
Sistema de Gestión de Horarios

## Stack
- Backend: NestJS + GraphQL (Apollo) + TypeORM -> PostgreSQL (Docker)
- Frontend: Angular 17+ (Standalone) + Ionic + GraphQL (Apollo)

## Cómo iniciar
1. Levantar BD: `podman compose up -d`
2. Backend: `cd backend && npm run start:dev`
3. Frontend: `cd frontend && npm start -- --host 0.0.0.0`

## Backend Rust (recomendado para evitar conflicto de puerto)
1. Levantar BD: `podman compose up -d`
2. Backend Rust: `cd backend-rs && ./scripts/dev-up.sh`
3. Para detenerlo: `cd backend-rs && ./scripts/dev-stop.sh`

## Licencia
Este proyecto está licenciado bajo GNU GPL v3.0 o posterior.
Consulta el archivo `LICENSE` para el texto completo.