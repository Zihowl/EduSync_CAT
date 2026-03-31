# EduSync - Proyecto de Egreso
“EduSync” es un sistema integrado compuesto por una plataforma web de administración (Calendar Administration Tool) y una aplicación móvil nativa Android. "CAT" permite a los administradores gestionar horarios académicos, catálogos institucionales (docentes, materias, grupos, salones) y usuarios del sistema.

## Stack
- Backend: Rust (Axum + async-graphql + SQLx) -> PostgreSQL
- Frontend: Angular 20+ (Standalone) + Ionic + GraphQL (Apollo)

## Cómo iniciar
1. Levantar BD: `podman compose up -d`
2. Backend (Rust): `cd backend-rs && ./scripts/dev-up.sh`
3. Frontend (Ionic + Angular):
   - `cd frontend`
   - `ionic serve --host 0.0.0.0`
   - (o `npm start -- --host 0.0.0.0 --port 8100`)

> Nota: Ionic corre en `http://localhost:8100` y el backend Rust en `http://localhost:3000`.
4. Crear Tunel para pruebas:
   -`cloudflared tunnel --url http://localhost:8100` 

## Backend Legacy (NestJS)
El backend en `backend/` se conserva como referencia histórica de la migración.

## Licencia
Este proyecto está licenciado bajo GNU GPL v3.0 o posterior.
Consulta el archivo `LICENSE` para el texto completo.