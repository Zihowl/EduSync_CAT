<div align="center">
  <img src="./logo.jpg" alt="EduSync Logo" width="220" style="border-radius: 16px; margin-bottom: 1rem;" />
  <h1>EduSync</h1>
  <p><strong>Plataforma Integral de Gestión Académica, Horarios y Colaboración Estudiantil</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Backend-Rust_1.85+-orange.svg?logo=rust" alt="Rust" />
    <img src="https://img.shields.io/badge/Framework-Axum_0.8-blue.svg?logo=rust" alt="Axum" />
    <img src="https://img.shields.io/badge/API-GraphQL_%26_REST-e10098.svg?logo=graphql" alt="GraphQL" />
    <img src="https://img.shields.io/badge/Database-PostgreSQL_17-336791.svg?logo=postgresql" alt="PostgreSQL" />
    <img src="https://img.shields.io/badge/Frontend_CAT-Angular_21_%2B_Ionic_8-dd0031.svg?logo=angular" alt="Angular" />
    <img src="https://img.shields.io/badge/Mobile_DOG-Android_App-3ddc84.svg?logo=android" alt="Android" />
    <img src="https://img.shields.io/badge/License-AGPL--3.0-green.svg" alt="License" />
  </p>
</div>

---

## 📌 Visión General del Ecosistema

**EduSync** es un ecosistema educativo modular de alto rendimiento diseñado para modernizar y sincronizar la vida académica de instituciones educativas de nivel medio superior y superior. 

El ecosistema unifica dos aplicaciones complementarias sobre un núcleo backend común de ultra-baja latencia desarrollado en **Rust**:

```
                       ┌────────────────────────────────────────────────────────┐
                       │               CORE BACKEND EN RUST                     │
                       │     (Axum 0.8 + async-graphql + SQLx + PostgreSQL)     │
                       └───────────────▲────────────────────────▲───────────────┘
                                       │                        │
                      HTTP / GraphQL   │                        │  REST / WebSockets
                                       │                        │  Push (FCM)
      ┌────────────────────────────────┴────────┐      ┌────────┴───────────────────────────────┐
      │          EduSync CAT                    │      │              EduSync DOG               │
      │  (Calendar Administration Tool)         │      │     (Daily Organizer & Guidance)       │
      ├─────────────────────────────────────────┤      ├────────────────────────────────────────┤
      │ • Plataforma Web Administrativa         │      │ • Aplicación Móvil para Estudiantes    │
      │ • Angular 21 (Standalone) + Ionic 8     │      │ • Consulta instantánea de horarios     │
      │ • Coordinadores y Super Administradores │      │ • Colaboración y tareas compartidas    │
      │ • Gestión de catálogos y colisiones     │      │ • Notificaciones push en tiempo real   │
      │ • Carga masiva de horarios en Excel     │      │ • Notas y respaldos cifrados           │
      └─────────────────────────────────────────┘      └────────────────────────────────────────┘
```

---

## 🚀 Componentes del Ecosistema

### 1. 🖥️ EduSync CAT (*Calendar Administration Tool*)
Plataforma web de administración centralizada diseñada para el cuerpo directivo, coordinadores académicos y administradores de horarios (`SUPER_ADMIN` y `ADMIN_HORARIOS`).

* **Carga Masiva de Horarios con Detección de Colisiones:** Importación de archivos Excel (`.xlsx`, `.csv`) con motor de validación en Rust (`calamine`), previsualización interactiva fila por fila y detección automática de solapamiento en aulas, docentes y grupos.
* **Gestión Jerárquica de Grupos y Subgrupos:** Soporte para ramas de grupos (ej. *1A*, *2B*) y sus subgrupos de laboratorio o idiomas con herencia de horarios.
* **Catálogos Institucionales Completos:** Administración de edificios, aulas con capacidades, materias por grado/semestre y directorio docente.
* **Control y Gobernanza Institucional:** Configuración de ciclo escolar activo, restricción de registros mediante dominios de correo permitidos (ej. `@institucion.edu.mx`) y auditoría de eventos (*Audit Logs*) con búsqueda trigramada en PostgreSQL.

### 2. 📱 EduSync DOG (*Daily Organizer & Guidance*)
Aplicación móvil nativa orientada a la comunidad de **estudiantes** y **profesores**, diseñada para ser su asistente diario de organización académica.

* **Consulta de Horarios Dinámicos y en Tiempo Real:** Visualización fluida de materias, horas, docentes y aulas asignadas, sincronizadas automáticamente con los cambios emitidos por CAT.
* **Colaboración y Compartición de Tareas (Viral Task Collaboration):**
  * Los estudiantes pueden compartir asignaciones y proyectos con sus compañeros de equipo.
  * Permite delegar o reenviar tareas compartidas entre los miembros activos de un grupo.
  * Flujo de invitación interactivo: aceptación, rechazo y seguimiento de entregas.
* **Notificaciones Push Automatizadas (Firebase Cloud Messaging):**
  * Recordatorios inteligentes de entregas de tareas próximas a vencer.
  * Avisos push inmediatos ante invitaciones de tareas compartidas o cambios en horarios.
* **Privacidad y Respaldos Cifrados:**
  * Almacenamiento seguro de apuntes, notas personales y archivos adjuntos (`user_files` y `user_backups`) con envoltorio criptográfico para garantizar la privacidad de los datos del alumno.

---

## ⚡ Rendimiento y Benchmarks de Concurrencia

El backend fue sometido a pruebas de estrés intensivas con **ApacheBench** y pruebas de carga concurrente. Los resultados demuestran la capacidad de atender a instituciones con decenas de miles de usuarios simultáneos en una sola instancia de servidor:

| Escenario de Carga | Concurrencia Simultánea | Peticiones / Seg. (RPS) | Latencia Mediana | Tasa de Éxito |
| :--- | :---: | :---: | :---: | :---: |
| **Consultas de Horarios con BD (`/api/public/schedules`)** | 500 conexiones | **13,621 req/s** | **9.0 ms** | **100% (0 fallos)** |
| **API GraphQL Autenticada con JWT (`GetGroups`)** | 500 conexiones | **20,495 req/s** | **6.0 ms** | **100% (0 fallos)** |
| **API GraphQL en Ráfaga Extrema** | 1,000 conexiones | **16,036 req/s** | **7.0 ms** | **100% (0 fallos)** |
| **Conexiones WebSocket Persistentes (`/graphql/ws`)** | 10,000 sockets activos | *Tiempo Real* | *Instantáneo* | **100% (1.5 GB RAM)** |

### Capacidad Estimada de Usuarios
* **Usuarios activos navegando simultáneamente:** **130,000 a 300,000 usuarios** (asumiendo un *think time* estándar de 5 a 15 segundos entre interacciones).
* **Conexiones HTTP concurrentes en ráfaga pura:** **+13,000 req/s** sostenidas sin pérdida de paquetes.
* **Optimización de Ancho de Banda:** Capa de compresión HTTP integrada (`tower-http`) que reduce el tamaño de las cargas útiles en un **82.3%** mediante Gzip/Brotli/Zstandard.

---

## 🛠️ Stack Tecnológico

### Backend
* **Lenguaje:** Rust 2024 Edition (v1.85+)
* **Servidor Web:** [Axum 0.8](https://github.com/tokio-rs/axum) sobre el runtime asíncrono [Tokio](https://tokio.rs/)
* **Capa API:** [async-graphql 7](https://async-graphql.github.io/) (GraphQL Queries, Mutations y Subscriptions vía WebSockets) + REST Handlers
* **Base de Datos & ORM:** [PostgreSQL 17](https://www.postgresql.org/) con [SQLx 0.8](https://github.com/launchbadge/sqlx) (consultas tipadas en tiempo de compilación y migraciones automáticas)
* **Seguridad & Cripto:** Hashing de contraseñas con [Argon2id](https://crates.io/crates/argon2), tokens [JWT](https://crates.io/crates/jsonwebtoken), keystore criptográfico y caché de sesión en memoria `AuthUserCache`
* **Procesamiento de Archivos:** [Calamine](https://crates.io/crates/calamine) para lectura de alta velocidad de libros de Excel
* **Notificaciones & Correo:** Firebase Cloud Messaging (FCM HTTP v1) y [Brevo](https://www.brevo.com/) REST API

### Frontend CAT (Web Administrativa)
* **Framework:** [Angular 21](https://angular.dev/) (Standalone Components, Signals y Control Flow sintáctico)
* **UI & Componentes:** [Ionic Framework 8](https://ionicframework.com/) + Bootstrap 5 + Ionicons
* **Cliente GraphQL:** [Apollo Angular](https://apollo-angular.com/) con caché reactivo
* **Compilación:** Vite / Angular DevKit

### Infraestructura
* **Contenedores:** Docker / Podman con `compose.yml`
* **Redes y Túneles:** Cloudflare Zero Trust / Cloudflared

---

## 📂 Estructura del Repositorio

```text
EduSync_CAT/
├── compose.yml              # Definición de contenedor para PostgreSQL optimizado
├── logo.jpg                 # Logotipo oficial del ecosistema EduSync
├── LICENSE                  # Licencia AGPL-3.0-or-later
├── backend/                 # Backend en Rust
│   ├── Cargo.toml           # Dependencias y configuración de compilación de Rust
│   ├── migrations/          # Migraciones SQLx para el esquema de PostgreSQL
│   ├── keys/                # Llaves de servicio (Firebase FCM, llaves criptográficas)
│   └── src/
│       ├── domain/          # Modelos de negocio, puertos y servicios desacoplados
│       ├── infrastructure/  # Repositorios SQLx de PostgreSQL y servicios externos
│       ├── adapters/        # GraphQL (resolvers, tipos), REST handlers y middleware
│       └── config.rs        # Configuración centralizada basada en variables de entorno
└── frontend/                # Frontend Web CAT
    ├── src/app/             # Módulos: Auth, Admin (horarios, catálogos, usuarios, auditoría)
    ├── package.json         # Dependencias de Angular e Ionic
    └── ionic.config.json    # Configuración de Ionic CLI
```

---

## ⚙️ Guía de Instalación y Ejecución

### Requisitos Previos
* **Rust:** Versión 1.85 o superior (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
* **Node.js:** Versión 20 LTS o superior
* **Motor de Contenedores:** Docker o Podman con `docker-compose` o `podman-compose`

---

### 1. Levantar la Base de Datos
Inicia el contenedor de PostgreSQL preconfigurado:
```bash
podman compose up -d
# o bien con Docker:
docker compose up -d
```

### 2. Configurar el Backend
Copia o edita el archivo `backend/.env`:
```ini
APP_HOST=0.0.0.0
APP_PORT=3000
DATABASE_URL=postgres://postgres:root@localhost:5432/edusync_db
JWT_SECRET=tu_clave_secreta_super_segura
JWT_EXPIRES_IN_SECS=86400
CORS_ORIGIN=*

# Optimización del Pool de PostgreSQL
DB_MAX_CONNECTIONS=50
DB_MIN_CONNECTIONS=5
DB_TEST_BEFORE_ACQUIRE=false

# Proveedor de Correos (Brevo)
BREVO_API_KEY=tu_api_key_de_brevo
BREVO_SENDER_EMAIL=contacto@tudominio.edu.mx
BREVO_SENDER_NAME="EduSync Servicios Escolares"

# Notificaciones Push FCM (Opcional, vacío desactiva push)
FCM_SERVICE_ACCOUNT_PATH=./keys/firebase-adminsdk.json
FCM_PROJECT_ID=tu-proyecto-firebase
```

### 3. Compilar y Ejecutar el Backend
```bash
cd backend

# Modo desarrollo con recarga:
cargo run

# Modo producción de alto rendimiento (Recomendado para pruebas de carga):
cargo run --release
```
> *Nota:* Al iniciar por primera vez, el backend ejecuta automáticamente las migraciones pendientes en PostgreSQL (`sqlx::migrate!`). Si la base de datos está vacía, activará el **Protocolo Génesis**, creando las credenciales maestras iniciales de Super Administrador.

El backend expondrá:
* **API GraphQL y Playground interactivo:** `http://localhost:3000/graphql`
* **Suscripciones WebSocket en tiempo real:** `ws://localhost:3000/graphql/ws`
* **Consulta de Horarios Públicos:** `http://localhost:3000/api/public/schedules`
* **Health Check:** `http://localhost:3000/health`

---

### 4. Ejecutar el Frontend Web CAT
En otra terminal:
```bash
cd frontend

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm start -- --host 0.0.0.0 --port 8100
```
Abre tu navegador en `http://localhost:8100` para acceder a la consola administrativa de EduSync CAT.

---

## 🧪 Pruebas Automatizadas

El backend incluye una suite exhaustiva de pruebas unitarias y de integración que validan la lógica de negocio, colisiones de horarios, políticas de autenticación y transacciones:

```bash
cd backend
cargo test
```

---

## 🔒 Seguridad y Privacidad

* **Políticas de Plataforma:** Separación criptográfica estricta de roles: las credenciales administrativas solo son válidas para la plataforma web **CAT**, mientras que los accesos de estudiantes y profesores están delegados a la aplicación móvil **DOG**.
* **Contraseñas Resistentes:** Algoritmo de hashing **Argon2id** con salting aleatorio criptográfico por usuario.
* **Control de Revocación de Sesiones:** El campo `tokens_invalid_before` garantiza que el cambio de contraseña o restablecimiento forzado invalide de inmediato cualquier JWT emitido con anterioridad.
* **Caché Protegido en Memoria:** Validación de sesión en RAM mediante `AuthUserCache` con TTL automático para proteger la base de datos contra ataques de denegación de servicio por consultas repetitivas.

---

## 📄 Licencia

Este proyecto se distribuye bajo los términos de la licencia **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**. Para más detalles, consulta el archivo [LICENSE](./LICENSE).