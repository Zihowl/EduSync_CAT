-- Roles para usuarios de la app móvil DOG (alumno/docente).
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'STUDENT';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'TEACHER';

-- Registros pendientes de verificación por correo (6 dígitos, 10 min).
CREATE TABLE IF NOT EXISTS pending_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    verification_token UUID NOT NULL UNIQUE,
    verification_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_registrations_email
    ON pending_registrations(lower(email));
CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires
    ON pending_registrations(expires_at);
