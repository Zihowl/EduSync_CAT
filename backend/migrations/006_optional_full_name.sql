-- =============================================================================
-- El nombre completo deja de ser obligatorio: los alumnos de DOG ya no eligen
-- nombre (basta su username). El nombre de los docentes lo sigue definiendo el
-- catálogo CAT. Las cuentas administrativas conservan su nombre.
-- =============================================================================

ALTER TABLE users ALTER COLUMN full_name DROP NOT NULL;

-- Limpieza: los alumnos ya registrados pierden su nombre guardado.
UPDATE users SET full_name = NULL WHERE role = 'STUDENT';
