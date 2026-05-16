-- Respaldo cifrado de los datos personales del usuario (app DOG).
-- El servidor SOLO almacena texto cifrado: el contenido (tareas, notas,
-- materias) se cifra en el dispositivo con una clave derivada de la
-- contraseña del usuario. Ni el administrador puede descifrarlo.

CREATE TABLE user_backups (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
