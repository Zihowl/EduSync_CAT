-- =============================================================================
-- Entrega de la colaboración de tareas: push (FCM) + eventos durables +
-- estado de completado / archivado. Complementa 005_task_collaboration.sql.
-- =============================================================================

-- 1. Tokens FCM por usuario/dispositivo. Un mismo usuario puede tener varios
--    (multi-dispositivo); FCM rota los tokens y el cliente los reenvía.
CREATE TABLE IF NOT EXISTS device_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token        TEXT NOT NULL,
    platform     TEXT NOT NULL DEFAULT 'ANDROID',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, token)
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens (user_id);

-- 2. Eventos durables de notificación. Sirven como fallback si FCM falla y
--    como bandeja "in-app" cuando la app sincroniza al volver al foreground.
--    `event_type` ∈ {TASK_SHARED, TASK_ACCEPTED, TASK_REJECTED, TASK_REMINDER, TASK_COMPLETED}.
CREATE TABLE IF NOT EXISTS notification_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type     TEXT NOT NULL,
    shared_task_id UUID REFERENCES shared_tasks(id) ON DELETE CASCADE,
    actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    payload_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ack_at         TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient_unack
    ON notification_events (recipient_id) WHERE ack_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notif_recipient_created
    ON notification_events (recipient_id, created_at DESC);

-- 3. Completado por destinatario + archivado por ambos lados. Permite:
--    - Bloquear toques a quien ya completó (RQF-APP-47 + decisión de producto).
--    - Que sender y destinatario archiven la tarea independientemente.
ALTER TABLE shared_task_recipients
    ADD COLUMN IF NOT EXISTS completed_at             TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS archived_by_recipient_at TIMESTAMPTZ NULL;

ALTER TABLE shared_tasks
    ADD COLUMN IF NOT EXISTS archived_by_owner_at TIMESTAMPTZ NULL;
