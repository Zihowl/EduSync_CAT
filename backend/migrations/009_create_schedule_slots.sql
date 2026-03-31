CREATE TABLE IF NOT EXISTS schedule_slots (
    id SERIAL PRIMARY KEY,
    teacher_id INT NOT NULL REFERENCES teachers(id),
    subject_id INT NOT NULL REFERENCES subjects(id),
    classroom_id INT NOT NULL REFERENCES classrooms(id),
    group_id INT NOT NULL REFERENCES groups(id),
    day_of_week INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    subgroup VARCHAR(100),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_group_day ON schedule_slots(group_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedule_teacher_day ON schedule_slots(teacher_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_schedule_classroom_day ON schedule_slots(classroom_id, day_of_week);
