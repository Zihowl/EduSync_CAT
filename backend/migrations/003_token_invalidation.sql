-- Marca de invalidación de sesiones: cualquier JWT emitido (campo `iat`)
-- antes de este instante deja de ser válido. Se actualiza al cambiar las
-- credenciales para cerrar todas las sesiones abiertas de esa cuenta.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_invalid_before TIMESTAMPTZ;
