ALTER TABLE groups
    DROP CONSTRAINT IF EXISTS groups_name_key;

DROP INDEX IF EXISTS groups_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS groups_root_name_unique_idx
    ON groups (name)
    WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS groups_parent_name_unique_idx
    ON groups (parent_id, name)
    WHERE parent_id IS NOT NULL;

INSERT INTO groups (name, parent_id)
SELECT DISTINCT btrim(s.subgroup) AS name, g.id AS parent_id
FROM schedule_slots s
JOIN groups g ON g.id = s.group_id
WHERE s.subgroup IS NOT NULL
  AND btrim(s.subgroup) <> ''
ON CONFLICT DO NOTHING;
