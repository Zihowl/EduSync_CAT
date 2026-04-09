ALTER TABLE teachers
    DROP CONSTRAINT IF EXISTS teachers_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS teachers_email_unique_idx
    ON teachers (email)
    WHERE email IS NOT NULL;

ALTER TABLE classrooms
    DROP CONSTRAINT IF EXISTS classrooms_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS classrooms_name_building_unique_idx
    ON classrooms (name, building_id);

CREATE UNIQUE INDEX IF NOT EXISTS classrooms_name_without_building_unique_idx
    ON classrooms (name)
    WHERE building_id IS NULL;