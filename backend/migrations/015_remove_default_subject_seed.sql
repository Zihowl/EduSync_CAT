DELETE FROM subjects s
WHERE s.code IN (
    'MAT101',
    'FIS201',
    'PROG301',
    'BD401',
    'RED501',
    'ING601',
    'ETIC701',
    'ADM801'
)
AND NOT EXISTS (
    SELECT 1
    FROM schedule_slots ss
    WHERE ss.subject_id = s.id
);