CREATE OR REPLACE FUNCTION prevent_group_delete_with_subgroup_schedules()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM schedule_slots s
        WHERE s.group_id = OLD.id
           OR (
               OLD.parent_id IS NOT NULL
               AND s.group_id = OLD.parent_id
               AND COALESCE(NULLIF(BTRIM(s.subgroup), ''), '') = BTRIM(OLD.name)
           )
    ) THEN
        RAISE EXCEPTION 'No se puede eliminar el grupo o subgrupo porque tiene bloques de horario asociados. Elimina primero los horarios.'
            USING ERRCODE = '23503';
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_group_delete_with_subgroup_schedules ON "groups";

CREATE TRIGGER prevent_group_delete_with_subgroup_schedules
BEFORE DELETE ON "groups"
FOR EACH ROW
EXECUTE FUNCTION prevent_group_delete_with_subgroup_schedules();
