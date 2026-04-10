# EduSync - Proyecto de Egreso
“EduSync” es un sistema integrado compuesto por una plataforma web de administración (Calendar Administration Tool) y una aplicación móvil nativa Android. "CAT" permite a los administradores gestionar horarios académicos, catálogos institucionales (docentes, materias, grupos, salones) y usuarios del sistema.

## Stack
- Backend: Rust (Axum + async-graphql + SQLx) -> PostgreSQL
- Frontend: Angular 20+ (Standalone) + Ionic + GraphQL (Apollo)

## Cómo iniciar
1. Levantar BD: `podman compose up -d`
2. Backend (Rust): `cd backend && ./scripts/dev-up.sh`
3. Frontend (Ionic + Angular):
   - `cd frontend`
   - `ionic serve --host 0.0.0.0 --port 8100`
   - (o `npm start -- --host 0.0.0.0 --port 8100`)

> Nota: El frontend corre en `http://localhost:8100` y el backend Rust en `http://localhost:3000`.
> El frontend llama al API por el mismo origen, así que el proxy local puede reenviar las rutas sin exponer el backend aparte.

## Licencia
Este proyecto se distribuye bajo AGPL-3.0-or-later. Ver LICENSE.