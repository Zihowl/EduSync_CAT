-- =============================================================================
-- Nombre completo obligatorio y nombre de usuario único para las cuentas.
-- Aplica a todos los roles: alumnos/docentes definen ambos en el registro;
-- los administradores reciben un username derivado de su correo.
-- =============================================================================

-- 1. Columna username en users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50);

-- Backfill: las cuentas existentes reciben un username a partir del correo
-- (parte local saneada). En caso de colisión se anexa un sufijo del id.
UPDATE users
SET username = LEFT(
        regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._]', '', 'g')
            || '_' || substr(replace(id::text, '-', ''), 1, 6),
        50)
WHERE username IS NULL OR btrim(username) = '';

-- Backfill de full_name vacío antes de imponer NOT NULL.
UPDATE users
SET full_name = split_part(email, '@', 1)
WHERE full_name IS NULL OR btrim(full_name) = '';

ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;

-- Unicidad case-insensitive del username.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
    ON users (lower(username));

-- 2. pending_registrations: el registro guarda nombre y username elegidos
--    antes de la verificación de correo.
ALTER TABLE pending_registrations
    ADD COLUMN IF NOT EXISTS full_name VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE pending_registrations
    ADD COLUMN IF NOT EXISTS username VARCHAR(50) NOT NULL DEFAULT '';
