-- 008_audit_logs_search_indexes.sql
-- Acelera la búsqueda libre de audit_logs (ILIKE %term%) usada por
-- PgAuditLogRepository::apply_filters. Sustituye el seq scan por GIN/pg_trgm.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_trgm
    ON audit_logs USING GIN (action gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type_trgm
    ON audit_logs USING GIN (resource_type gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email_trgm
    ON audit_logs USING GIN (actor_email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id_trgm
    ON audit_logs USING GIN (resource_id gin_trgm_ops);

-- details es JSONB; el repositorio actual hace details::text ILIKE.
-- Indexamos su proyección a texto para que el planner pueda usar GIN.
CREATE INDEX IF NOT EXISTS idx_audit_logs_details_text_trgm
    ON audit_logs USING GIN ((details::text) gin_trgm_ops);
