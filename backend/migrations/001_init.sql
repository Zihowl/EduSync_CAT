-- Extensions and Types
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'ADMIN_HORARIOS');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    password_hash TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'ADMIN_HORARIOS',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_temp_password BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    lockout_until TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Audit Logs table (Requires users)
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    actor_email TEXT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs (resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON audit_logs (actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_role ON audit_logs (actor_role);

-- 3. Allowed Domains table
CREATE TABLE IF NOT EXISTS allowed_domains (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL UNIQUE
);

-- 4. School Years table
CREATE TABLE IF NOT EXISTS school_years (
    id SERIAL PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Teachers table
CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    employee_number VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255)
);

CREATE UNIQUE INDEX IF NOT EXISTS teachers_email_unique_idx ON teachers (email) WHERE email IS NOT NULL;

-- 6. Subjects table
CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    grade INTEGER NULL,
    division VARCHAR(255) NULL
);

-- 7. Buildings table
CREATE TABLE IF NOT EXISTS buildings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT
);

-- 8. Classrooms table (Requires buildings)
CREATE TABLE IF NOT EXISTS classrooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    building_id INT REFERENCES buildings(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS classrooms_name_building_unique_idx ON classrooms (name, building_id);
CREATE UNIQUE INDEX IF NOT EXISTS classrooms_name_without_building_unique_idx ON classrooms (name) WHERE building_id IS NULL;

-- 9. Groups table (Self-referencing)
CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INT REFERENCES groups(id) ON DELETE SET NULL,
    grade INTEGER NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS groups_root_name_unique_idx ON groups (name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS groups_parent_name_unique_idx ON groups (parent_id, name) WHERE parent_id IS NOT NULL;

-- 10. Schedule Slots table (Requires teachers, subjects, classrooms, groups, users)
CREATE TABLE IF NOT EXISTS schedule_slots (
    id SERIAL PRIMARY KEY,
    teacher_id INT REFERENCES teachers(id) ON DELETE SET NULL,
    subject_id INT NOT NULL REFERENCES subjects(id),
    classroom_id INT NOT NULL REFERENCES classrooms(id),
    group_id INT NOT NULL REFERENCES groups(id),
    day_of_week INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subgroup VARCHAR(100),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_group_day ON schedule_slots(group_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedule_teacher_day ON schedule_slots(teacher_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedule_classroom_day ON schedule_slots(classroom_id, day_of_week);
