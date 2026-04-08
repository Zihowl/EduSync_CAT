ALTER TABLE subjects
    ADD COLUMN IF NOT EXISTS grade INTEGER NULL,
    ADD COLUMN IF NOT EXISTS division VARCHAR(255) NULL;

INSERT INTO subjects (code, name, grade, division) VALUES
    ('MAT101', 'Cálculo Diferencial', 1, 'Ciencias Básicas'),
    ('FIS201', 'Física Mecánica', 2, 'Ciencias Básicas'),
    ('PROG301', 'Programación Orientada a Objetos', 3, 'Tecnología'),
    ('BD401', 'Bases de Datos', 4, 'Tecnología'),
    ('RED501', 'Redes de Computadoras', 5, 'Tecnología'),
    ('ING601', 'Inglés Técnico', 6, 'Idiomas'),
    ('ETIC701', 'Ética Profesional', 7, 'Humanidades'),
    ('ADM801', 'Administración de Proyectos', 8, 'Administrativas')
ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        grade = EXCLUDED.grade,
        division = EXCLUDED.division;