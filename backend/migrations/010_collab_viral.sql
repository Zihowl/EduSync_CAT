-- =============================================================================
-- Refactor viral de colaboración: cualquier participante puede reenviar,
-- sub-estados de copia (OPEN/COMPLETED/DISMISSED_DONE/UNLINKED), invitador
-- por fila, y owner_unlinked_at para que el dueño se "salga" sin destruir la
-- colaboración entre receptores. Complementa 005 y 009.
-- =============================================================================

-- 1. inviter_user_id: quién envió ESTA invitación específica (puede no ser el owner).
ALTER TABLE shared_task_recipients
    ADD COLUMN IF NOT EXISTS inviter_user_id UUID NULL
        REFERENCES users(id) ON DELETE SET NULL;

-- Backfill: las invitaciones existentes vinieron todas del owner.
UPDATE shared_task_recipients r
   SET inviter_user_id = s.owner_user_id
  FROM shared_tasks s
 WHERE r.shared_task_id = s.id
   AND r.inviter_user_id IS NULL;

-- 2. sub_state: sub-estado de la copia, ortogonal a `status` (PENDING/ACCEPTED/REJECTED).
--    Solo aplica realmente cuando status = 'ACCEPTED'; para PENDING/REJECTED queda OPEN
--    por simplicidad de schema (nunca se consulta en esos casos).
ALTER TABLE shared_task_recipients
    ADD COLUMN IF NOT EXISTS sub_state TEXT NOT NULL DEFAULT 'OPEN',
    ADD COLUMN IF NOT EXISTS sub_state_at TIMESTAMPTZ NULL;

-- Backfill: COMPLETED si ya tenía completed_at, UNLINKED si fue archivada por receptor.
UPDATE shared_task_recipients
   SET sub_state = 'COMPLETED',
       sub_state_at = completed_at
 WHERE status = 'ACCEPTED'
   AND completed_at IS NOT NULL
   AND archived_by_recipient_at IS NULL;

UPDATE shared_task_recipients
   SET sub_state = 'UNLINKED',
       sub_state_at = archived_by_recipient_at
 WHERE archived_by_recipient_at IS NOT NULL;

-- CHECK constraint tras el backfill (DROP IF EXISTS para idempotencia en re-runs).
ALTER TABLE shared_task_recipients
    DROP CONSTRAINT IF EXISTS shared_task_recipients_sub_state_check;
ALTER TABLE shared_task_recipients
    ADD CONSTRAINT shared_task_recipients_sub_state_check
        CHECK (sub_state IN ('OPEN','COMPLETED','DISMISSED_DONE','UNLINKED'));

-- 3. owner_unlinked_at: el dueño borró su copia pero la colaboración entre
--    receptores sobrevive. Si el dueño vuelve a aparecer (futuro), basta con
--    reinsertarlo en shared_task_recipients.
ALTER TABLE shared_tasks
    ADD COLUMN IF NOT EXISTS owner_unlinked_at TIMESTAMPTZ NULL;

-- 4. Índice parcial para conteo rápido de "participantes activos" (regla 2+).
CREATE INDEX IF NOT EXISTS idx_recipients_active_open
    ON shared_task_recipients (shared_task_id)
 WHERE status = 'ACCEPTED' AND sub_state = 'OPEN';

-- Índice para localizar invitaciones pendientes a cancelar.
CREATE INDEX IF NOT EXISTS idx_recipients_pending
    ON shared_task_recipients (shared_task_id)
 WHERE status = 'PENDING';

-- 5. notification_events: añadimos los nuevos event_type usados por el sistema
--    viral (no requiere DDL, solo documentación de los valores aceptados).
--    Tipos vigentes: TASK_SHARED, TASK_ACCEPTED, TASK_REJECTED, TASK_REMINDER,
--    TASK_COMPLETED, INVITATION_CANCELED, TASK_INVITATION_RESPONDED.
COMMENT ON COLUMN notification_events.event_type IS
    'TASK_SHARED | TASK_ACCEPTED | TASK_REJECTED | TASK_REMINDER | TASK_COMPLETED | INVITATION_CANCELED | TASK_INVITATION_RESPONDED';
