-- =============================================================================
-- Colaboración de tareas (RQF-APP-45/46/47, RQNF-APP-43/44/45):
-- compartir tareas con compañeros, aceptar/rechazar y enviar recordatorios.
-- =============================================================================

-- 1. Perfil académico del usuario: grupo y subgrupo a los que está suscrito.
--    Permite derivar la lista de compañeros candidatos a compartir (RQNF-APP-43).
CREATE TABLE IF NOT EXISTS user_academic_profiles (
    user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    group_id    INTEGER NULL,
    subgroup_id INTEGER NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academic_profiles_group
    ON user_academic_profiles (group_id);
CREATE INDEX IF NOT EXISTS idx_academic_profiles_subgroup
    ON user_academic_profiles (subgroup_id);

-- 2. Tarea compartida: el contenido viaja cifrado (AES-256). El servidor solo
--    guarda ciphertext; la clave (enc_key) se entrega vía GraphQL al remitente
--    y a los destinatarios autorizados.
CREATE TABLE IF NOT EXISTS shared_tasks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ciphertext    TEXT NOT NULL,
    enc_key       TEXT NOT NULL,
    scope         TEXT NOT NULL DEFAULT 'SELECTED', -- GROUP | SELECTED
    title_preview VARCHAR(120) NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_owner ON shared_tasks (owner_user_id);

-- 3. Destinatarios de una tarea compartida con su estado de respuesta.
CREATE TABLE IF NOT EXISTS shared_task_recipients (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_task_id    UUID NOT NULL REFERENCES shared_tasks(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status            TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | ACCEPTED | REJECTED
    responded_at      TIMESTAMPTZ NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shared_task_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_task_recipients_recipient
    ON shared_task_recipients (recipient_user_id);

-- 4. Recordatorios (toques) enviados sobre una tarea compartida. El límite de
--    3 por usuario por tarea en 24 h (RQNF-APP-45) se valida por consulta.
CREATE TABLE IF NOT EXISTS task_reminders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_task_id    UUID NOT NULL REFERENCES shared_tasks(id) ON DELETE CASCADE,
    sender_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_reminders_quota
    ON task_reminders (shared_task_id, sender_user_id, recipient_user_id, created_at);
