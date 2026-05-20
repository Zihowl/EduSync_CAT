-- Respaldo cifrado de los archivos adjuntos de las notas de cada usuario.
-- `ciphertext` es el binario del archivo cifrado con AES-256 en el dispositivo
-- (base64); el servidor nunca lee su contenido (zero-knowledge).
CREATE TABLE IF NOT EXISTS user_files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_uuid   TEXT NOT NULL,            -- uuid estable generado por el cliente
    ciphertext  TEXT NOT NULL,            -- binario cifrado AES-256, en base64
    file_name   TEXT NOT NULL DEFAULT '', -- nombre original (cifrado por el cliente)
    file_size   BIGINT NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ NULL,         -- tombstone: no nulo = archivo borrado
    UNIQUE (user_id, file_uuid)
);

CREATE INDEX IF NOT EXISTS idx_user_files_user ON user_files (user_id);
