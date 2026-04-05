ALTER TABLE schedule_slots
    DROP CONSTRAINT IF EXISTS schedule_slots_teacher_id_fkey;

ALTER TABLE schedule_slots
    ALTER COLUMN teacher_id DROP NOT NULL;

ALTER TABLE schedule_slots
    ADD CONSTRAINT schedule_slots_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL;