-- Migración: Integridad referencial estricta para edificios, aulas, grupos, materias y docentes.
-- No se permite eliminar un edificio si tiene aulas, ni eliminar aula/grupo/materia/docente
-- si tiene bloques de horario asociados.

-- 1. Edificio → Aulas
ALTER TABLE classrooms
    DROP CONSTRAINT IF EXISTS classrooms_building_id_fkey;
ALTER TABLE classrooms
    ADD CONSTRAINT classrooms_building_id_fkey
    FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE RESTRICT;

-- 2. Horario → Docente
ALTER TABLE schedule_slots
    DROP CONSTRAINT IF EXISTS schedule_slots_teacher_id_fkey;
ALTER TABLE schedule_slots
    ADD CONSTRAINT schedule_slots_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE RESTRICT;

-- 3. Horario → Materia
ALTER TABLE schedule_slots
    DROP CONSTRAINT IF EXISTS schedule_slots_subject_id_fkey;
ALTER TABLE schedule_slots
    ADD CONSTRAINT schedule_slots_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT;

-- 4. Horario → Aula
ALTER TABLE schedule_slots
    DROP CONSTRAINT IF EXISTS schedule_slots_classroom_id_fkey;
ALTER TABLE schedule_slots
    ADD CONSTRAINT schedule_slots_classroom_id_fkey
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE RESTRICT;

-- 5. Horario → Grupo
ALTER TABLE schedule_slots
    DROP CONSTRAINT IF EXISTS schedule_slots_group_id_fkey;
ALTER TABLE schedule_slots
    ADD CONSTRAINT schedule_slots_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES "groups"(id) ON DELETE RESTRICT;
