use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::shared_task::{
        AcademicProfile, ForwardResult, InboxItem, MySharedTasksFilter, NotificationEvent,
        OutboxItem, Participant, RecipientStatus, ShareCandidate, SharedTask, SubState,
    },
    ports::collaboration_repository::{CollaborationRepository, RecipientSummary},
};

#[derive(Clone)]
pub struct PgCollaborationRepository {
    pool: PgPool,
}

impl PgCollaborationRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn map_sqlx(e: sqlx::Error) -> DomainError {
    DomainError::Internal(format!("Error de base de datos en colaboración: {e}"))
}

#[derive(FromRow)]
struct SharedTaskRow {
    id: Uuid,
    owner_user_id: Uuid,
    ciphertext: String,
    enc_key: String,
    scope: String,
    title_preview: String,
    created_at: DateTime<Utc>,
}

impl From<SharedTaskRow> for SharedTask {
    fn from(v: SharedTaskRow) -> Self {
        Self {
            id: v.id,
            owner_user_id: v.owner_user_id,
            ciphertext: v.ciphertext,
            enc_key: v.enc_key,
            scope: v.scope,
            title_preview: v.title_preview,
            created_at: v.created_at,
        }
    }
}

const SHARED_TASK_COLUMNS: &str =
    "id, owner_user_id, ciphertext, enc_key, scope, title_preview, created_at";

#[async_trait]
impl CollaborationRepository for PgCollaborationRepository {
    async fn upsert_academic_profile(
        &self,
        user_id: Uuid,
        group_id: Option<i32>,
        subgroup_id: Option<i32>,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "INSERT INTO user_academic_profiles (user_id, group_id, subgroup_id, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id) DO UPDATE
             SET group_id    = COALESCE(EXCLUDED.group_id,    user_academic_profiles.group_id),
                 subgroup_id = COALESCE(EXCLUDED.subgroup_id, user_academic_profiles.subgroup_id),
                 updated_at  = NOW()",
        )
        .bind(user_id)
        .bind(group_id)
        .bind(subgroup_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn find_academic_profile(
        &self,
        user_id: Uuid,
    ) -> Result<Option<AcademicProfile>, DomainError> {
        let row: Option<(Uuid, Option<i32>, Option<i32>)> = sqlx::query_as(
            "SELECT user_id, group_id, subgroup_id FROM user_academic_profiles WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(|(user_id, group_id, subgroup_id)| AcademicProfile {
            user_id,
            group_id,
            subgroup_id,
        }))
    }

    async fn find_candidates(
        &self,
        exclude_user_id: Uuid,
        group_id: Option<i32>,
        subgroup_id: Option<i32>,
        search: Option<&str>,
        shared_task_id: Option<Uuid>,
    ) -> Result<Vec<ShareCandidate>, DomainError> {
        let search_pattern = search
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty())
            .map(|s| format!("%{s}%"));

        // El árbol descendente del grupo raíz: a partir del subgrupo o grupo
        // del invitador, se sube por parent_id hasta la raíz y luego se baja
        // recolectando todos los descendientes. Esto cubre el caso "soy de 1A1
        // y puedo compartir con 1A, 1A2, 1A3" sin filtrar por materia.
        let rows: Vec<(Uuid, String, Option<String>, String, Option<bool>, Option<bool>)> = sqlx::query_as(
            r#"
            WITH RECURSIVE seed AS (
                SELECT id FROM groups WHERE id = $2
                UNION
                SELECT id FROM groups WHERE id = $3
            ),
            up AS (
                SELECT g.id, g.parent_id
                FROM groups g
                JOIN seed s ON s.id = g.id
                UNION ALL
                SELECT g.id, g.parent_id
                FROM groups g
                JOIN up ON up.parent_id = g.id
            ),
            roots AS (
                SELECT id FROM up WHERE parent_id IS NULL
            ),
            tree AS (
                SELECT id FROM roots
                UNION ALL
                SELECT g.id FROM groups g JOIN tree ON g.parent_id = tree.id
            )
            SELECT DISTINCT u.id, u.username, u.full_name, u.role::text AS role,
                   ($5::uuid IS NOT NULL AND EXISTS (
                       SELECT 1 FROM shared_task_recipients r
                       WHERE r.shared_task_id = $5
                         AND r.recipient_user_id = u.id
                         AND r.status = 'PENDING'
                   )) AS already_invited,
                   ($5::uuid IS NOT NULL AND EXISTS (
                       SELECT 1 FROM shared_task_recipients r
                       WHERE r.shared_task_id = $5
                         AND r.recipient_user_id = u.id
                         AND r.status = 'ACCEPTED'
                         AND r.sub_state IN ('OPEN','COMPLETED','DISMISSED_DONE')
                   )) AS already_has_copy
            FROM users u
            LEFT JOIN user_academic_profiles p ON p.user_id = u.id
            WHERE u.id <> $1
              AND u.is_active = TRUE
              AND u.role IN ('STUDENT', 'TEACHER')
              AND (
                   p.group_id IN (SELECT id FROM tree)
                OR p.subgroup_id IN (SELECT id FROM tree)
              )
              AND ($4::text IS NULL OR lower(u.username) LIKE $4)
            ORDER BY u.full_name
            LIMIT 200
            "#,
        )
        .bind(exclude_user_id)
        .bind(group_id)
        .bind(subgroup_id)
        .bind(search_pattern)
        .bind(shared_task_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(rows
            .into_iter()
            .map(
                |(user_id, username, full_name, role, already_invited, already_has_copy)| {
                    ShareCandidate {
                        user_id,
                        username,
                        full_name: full_name.unwrap_or_default(),
                        role,
                        already_invited: already_invited.unwrap_or(false),
                        already_has_copy: already_has_copy.unwrap_or(false),
                    }
                },
            )
            .collect())
    }

    async fn create_shared_task(
        &self,
        owner_user_id: Uuid,
        ciphertext: &str,
        enc_key: &str,
        scope: &str,
        title_preview: &str,
        recipient_ids: &[Uuid],
    ) -> Result<SharedTask, DomainError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        let row = sqlx::query_as::<_, SharedTaskRow>(&format!(
            "INSERT INTO shared_tasks (owner_user_id, ciphertext, enc_key, scope, title_preview)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING {SHARED_TASK_COLUMNS}"
        ))
        .bind(owner_user_id)
        .bind(ciphertext)
        .bind(enc_key)
        .bind(scope)
        .bind(title_preview)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        for recipient_id in recipient_ids {
            sqlx::query(
                "INSERT INTO shared_task_recipients
                    (shared_task_id, recipient_user_id, inviter_user_id, sub_state, sub_state_at)
                 VALUES ($1, $2, $3, 'OPEN', NOW())
                 ON CONFLICT (shared_task_id, recipient_user_id) DO NOTHING",
            )
            .bind(row.id)
            .bind(recipient_id)
            .bind(owner_user_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx)?;
        }

        tx.commit().await.map_err(map_sqlx)?;
        Ok(row.into())
    }

    async fn find_shared_task(&self, id: Uuid) -> Result<Option<SharedTask>, DomainError> {
        let row = sqlx::query_as::<_, SharedTaskRow>(&format!(
            "SELECT {SHARED_TASK_COLUMNS} FROM shared_tasks WHERE id = $1"
        ))
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(Into::into))
    }

    async fn find_inbox(&self, user_id: Uuid) -> Result<Vec<InboxItem>, DomainError> {
        // El inbox del nuevo modelo excluye UNLINKED (desvinculados) y separa
        // los datos del invitador (puede no ser el dueño en el modelo viral).
        let rows: Vec<(
            Uuid,
            Uuid,
            String,
            String,
            String,
            String,
            DateTime<Utc>,
            String,
            String,
            String,
            Option<String>,
            Option<Uuid>,
            Option<String>,
            Option<String>,
        )> = sqlx::query_as(
            "SELECT t.id, t.owner_user_id, t.ciphertext, t.enc_key, t.scope, t.title_preview,
                    t.created_at, r.status, r.sub_state, o.username, o.full_name,
                    r.inviter_user_id, iu.username, iu.full_name
             FROM shared_task_recipients r
             JOIN shared_tasks t ON t.id = r.shared_task_id
             JOIN users o ON o.id = t.owner_user_id
             LEFT JOIN users iu ON iu.id = r.inviter_user_id
             WHERE r.recipient_user_id = $1
               AND r.sub_state <> 'UNLINKED'
             ORDER BY t.created_at DESC
             LIMIT 200",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(rows
            .into_iter()
            .map(
                |(
                    id,
                    owner_user_id,
                    ciphertext,
                    enc_key,
                    scope,
                    title_preview,
                    created_at,
                    status,
                    sub_state,
                    owner_username,
                    owner_full_name,
                    inviter_user_id,
                    inviter_username,
                    inviter_full_name,
                )| InboxItem {
                    shared_task: SharedTask {
                        id,
                        owner_user_id,
                        ciphertext,
                        enc_key,
                        scope,
                        title_preview,
                        created_at,
                    },
                    status,
                    sub_state,
                    owner_username,
                    owner_full_name: owner_full_name.unwrap_or_default(),
                    inviter_user_id,
                    inviter_username,
                    inviter_full_name,
                },
            )
            .collect())
    }

    async fn find_outbox(&self, owner_user_id: Uuid) -> Result<Vec<OutboxItem>, DomainError> {
        // En el modelo viral, "outbox" del dueño sigue mostrando solo las
        // tareas que él creó. Las que reenvió como receptor aparecen en
        // `find_my_shared_tasks(LINKED)`. Se filtra `owner_unlinked_at` (el
        // dueño borró su copia).
        let tasks = sqlx::query_as::<_, SharedTaskRow>(&format!(
            "SELECT {SHARED_TASK_COLUMNS} FROM shared_tasks
             WHERE owner_user_id = $1
               AND archived_by_owner_at IS NULL
               AND owner_unlinked_at IS NULL
             ORDER BY created_at DESC LIMIT 200"
        ))
        .bind(owner_user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;

        let mut items = Vec::with_capacity(tasks.len());
        for task in tasks {
            let recipients: Vec<(
                Uuid,
                String,
                Option<String>,
                String,
                String,
                i64,
                Option<DateTime<Utc>>,
                Option<DateTime<Utc>>,
                Option<Uuid>,
            )> = sqlx::query_as(
                "SELECT r.recipient_user_id, u.username, u.full_name, r.status, r.sub_state,
                        (SELECT COUNT(*) FROM task_reminders tr
                         WHERE tr.shared_task_id = r.shared_task_id
                           AND tr.sender_user_id = $2
                           AND tr.recipient_user_id = r.recipient_user_id
                           AND tr.created_at > NOW() - INTERVAL '24 hours') AS reminders,
                        r.completed_at, r.archived_by_recipient_at, r.inviter_user_id
                 FROM shared_task_recipients r
                 JOIN users u ON u.id = r.recipient_user_id
                 WHERE r.shared_task_id = $1
                 ORDER BY u.full_name",
            )
            .bind(task.id)
            .bind(owner_user_id)
            .fetch_all(&self.pool)
            .await
            .map_err(map_sqlx)?;

            items.push(OutboxItem {
                shared_task: task.into(),
                recipients: recipients
                    .into_iter()
                    .map(
                        |(
                            user_id,
                            username,
                            full_name,
                            status,
                            sub_state,
                            reminders_sent_24h,
                            completed_at,
                            archived_by_recipient_at,
                            inviter_user_id,
                        )| RecipientStatus {
                            user_id,
                            username,
                            full_name: full_name.unwrap_or_default(),
                            status,
                            sub_state,
                            reminders_sent_24h,
                            completed_at,
                            archived_by_recipient_at,
                            inviter_user_id,
                        },
                    )
                    .collect(),
            });
        }
        Ok(items)
    }

    async fn list_participants(
        &self,
        shared_task_id: Uuid,
        viewer_user_id: Uuid,
    ) -> Result<Vec<Participant>, DomainError> {
        // Modelo viral: muestra al dueño (si no se desvinculó) + todos los
        // recipients con status ∈ {PENDING, ACCEPTED} y sub_state distinto a
        // UNLINKED. El cliente decide el estado del botón a partir de
        // (status, sub_state): Pendiente / Cerrada / Activo.
        let rows: Vec<(
            Uuid,
            String,
            Option<String>,
            String,
            String,
            String,
            i64,
            Option<DateTime<Utc>>,
            Option<Uuid>,
        )> = sqlx::query_as(
            "WITH task AS (
                SELECT id, owner_user_id, owner_unlinked_at
                FROM shared_tasks WHERE id = $1
             )
             SELECT u.id, u.username, u.full_name,
                    'OWNER'::text AS role,
                    'OWNER'::text AS status,
                    'OPEN'::text AS sub_state,
                    (SELECT COUNT(*) FROM task_reminders tr
                       WHERE tr.shared_task_id = task.id
                         AND tr.sender_user_id = $2
                         AND tr.recipient_user_id = u.id
                         AND tr.created_at > NOW() - INTERVAL '24 hours') AS reminders,
                    NULL::timestamptz AS completed_at,
                    NULL::uuid AS inviter_user_id
             FROM task
             JOIN users u ON u.id = task.owner_user_id
             WHERE u.id <> $2 AND task.owner_unlinked_at IS NULL
             UNION ALL
             SELECT u.id, u.username, u.full_name,
                    'RECIPIENT'::text AS role,
                    r.status,
                    r.sub_state,
                    (SELECT COUNT(*) FROM task_reminders tr
                       WHERE tr.shared_task_id = r.shared_task_id
                         AND tr.sender_user_id = $2
                         AND tr.recipient_user_id = r.recipient_user_id
                         AND tr.created_at > NOW() - INTERVAL '24 hours') AS reminders,
                    r.completed_at,
                    r.inviter_user_id
             FROM shared_task_recipients r
             JOIN users u ON u.id = r.recipient_user_id
             WHERE r.shared_task_id = $1
               AND r.status IN ('PENDING','ACCEPTED')
               AND r.sub_state <> 'UNLINKED'
               AND r.recipient_user_id <> $2
             ORDER BY 4 DESC, 3 NULLS LAST, 2",
        )
        .bind(shared_task_id)
        .bind(viewer_user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(rows
            .into_iter()
            .map(
                |(
                    user_id,
                    username,
                    full_name,
                    role,
                    status,
                    sub_state,
                    reminders,
                    completed_at,
                    inviter_user_id,
                )| Participant {
                    user_id,
                    username,
                    full_name: full_name.unwrap_or_default(),
                    role,
                    status,
                    sub_state,
                    completed: completed_at.is_some(),
                    reminders_sent_24h: reminders,
                    inviter_user_id,
                },
            )
            .collect())
    }

    async fn recipient_status(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<Option<String>, DomainError> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT status FROM shared_task_recipients
             WHERE shared_task_id = $1 AND recipient_user_id = $2",
        )
        .bind(shared_task_id)
        .bind(recipient_user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(|(status,)| status))
    }

    async fn recipient_inviter(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<Option<Uuid>, DomainError> {
        let row: Option<(Option<Uuid>,)> = sqlx::query_as(
            "SELECT inviter_user_id FROM shared_task_recipients
             WHERE shared_task_id = $1 AND recipient_user_id = $2",
        )
        .bind(shared_task_id)
        .bind(recipient_user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.and_then(|(i,)| i))
    }

    async fn set_recipient_status(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
        status: &str,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "UPDATE shared_task_recipients
             SET status = $3, responded_at = NOW()
             WHERE shared_task_id = $1 AND recipient_user_id = $2",
        )
        .bind(shared_task_id)
        .bind(recipient_user_id)
        .bind(status)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn count_reminders_last_24h(
        &self,
        shared_task_id: Uuid,
        sender_user_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<i64, DomainError> {
        let count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM task_reminders
             WHERE shared_task_id = $1
               AND sender_user_id = $2
               AND recipient_user_id = $3
               AND created_at > NOW() - INTERVAL '24 hours'",
        )
        .bind(shared_task_id)
        .bind(sender_user_id)
        .bind(recipient_user_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(count.0)
    }

    async fn create_reminder(
        &self,
        shared_task_id: Uuid,
        sender_user_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "INSERT INTO task_reminders (shared_task_id, sender_user_id, recipient_user_id)
             VALUES ($1, $2, $3)",
        )
        .bind(shared_task_id)
        .bind(sender_user_id)
        .bind(recipient_user_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn set_recipient_completed(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
        completed: bool,
    ) -> Result<Uuid, DomainError> {
        // Reflejo bidireccional con sub_state: completar fija COMPLETED,
        // desmarcar reabre a OPEN. DISMISSED_DONE se setea por mark_sub_state.
        let row: Option<(Uuid,)> = sqlx::query_as(
            "UPDATE shared_task_recipients r
             SET completed_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
                 sub_state    = CASE WHEN $3 THEN 'COMPLETED' ELSE 'OPEN' END,
                 sub_state_at = NOW()
             FROM shared_tasks t
             WHERE r.shared_task_id = $1
               AND r.recipient_user_id = $2
               AND t.id = r.shared_task_id
               AND r.status = 'ACCEPTED'
               AND r.sub_state <> 'UNLINKED'
             RETURNING t.owner_user_id",
        )
        .bind(shared_task_id)
        .bind(recipient_user_id)
        .bind(completed)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;

        row.map(|(owner,)| owner).ok_or_else(|| {
            DomainError::NotFound("Tarea compartida no encontrada para el destinatario".to_string())
        })
    }

    async fn archive_for_recipient(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE shared_task_recipients
             SET archived_by_recipient_at = NOW()
             WHERE shared_task_id = $1 AND recipient_user_id = $2",
        )
        .bind(shared_task_id)
        .bind(recipient_user_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound(
                "No eres destinatario de esa tarea compartida".to_string(),
            ));
        }
        Ok(())
    }

    async fn archive_for_owner(
        &self,
        shared_task_id: Uuid,
        owner_user_id: Uuid,
    ) -> Result<(), DomainError> {
        let result = sqlx::query(
            "UPDATE shared_tasks
             SET archived_by_owner_at = NOW()
             WHERE id = $1 AND owner_user_id = $2",
        )
        .bind(shared_task_id)
        .bind(owner_user_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        if result.rows_affected() == 0 {
            return Err(DomainError::NotFound(
                "No eres dueño de esa tarea compartida".to_string(),
            ));
        }
        Ok(())
    }

    async fn recipient_summaries(
        &self,
        ids: &[Uuid],
    ) -> Result<Vec<RecipientSummary>, DomainError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let rows: Vec<(Uuid, String, Option<String>)> = sqlx::query_as(
            "SELECT id, username, full_name FROM users WHERE id = ANY($1)",
        )
        .bind(ids)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows
            .into_iter()
            .map(|(user_id, username, full_name)| RecipientSummary {
                user_id,
                username,
                full_name: full_name.unwrap_or_default(),
            })
            .collect())
    }

    async fn recipient_has_completed(
        &self,
        shared_task_id: Uuid,
        recipient_user_id: Uuid,
    ) -> Result<bool, DomainError> {
        // En el modelo viral, COMPLETED y DISMISSED_DONE bloquean toques por
        // igual; ambos cuentan como "cerrado".
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT sub_state FROM shared_task_recipients
             WHERE shared_task_id = $1 AND recipient_user_id = $2",
        )
        .bind(shared_task_id)
        .bind(recipient_user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(matches!(row.as_ref().map(|(s,)| s.as_str()), Some("COMPLETED") | Some("DISMISSED_DONE")))
    }

    async fn actor_identity(
        &self,
        user_id: Uuid,
    ) -> Result<Option<(String, String)>, DomainError> {
        let row: Option<(String, Option<String>)> = sqlx::query_as(
            "SELECT username, full_name FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.map(|(u, f)| (u, f.unwrap_or_default())))
    }

    async fn register_device_token(
        &self,
        user_id: Uuid,
        token: &str,
        platform: &str,
    ) -> Result<(), DomainError> {
        // Un token FCM es propiedad de UNA instalación; si el mismo token estaba
        // ligado a otra cuenta (logout sin desregistrar, reinstalación, etc.),
        // lo desligamos para que las notificaciones de la cuenta anterior dejen
        // de llegar a este dispositivo.
        sqlx::query("DELETE FROM device_tokens WHERE token = $1 AND user_id <> $2")
            .bind(token)
            .bind(user_id)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        sqlx::query(
            "INSERT INTO device_tokens (user_id, token, platform, last_seen_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, token) DO UPDATE SET last_seen_at = NOW()",
        )
        .bind(user_id)
        .bind(token)
        .bind(platform)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn unregister_device_token(
        &self,
        user_id: Uuid,
        token: &str,
    ) -> Result<(), DomainError> {
        sqlx::query(
            "DELETE FROM device_tokens WHERE user_id = $1 AND token = $2",
        )
        .bind(user_id)
        .bind(token)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn tokens_for_user(&self, user_id: Uuid) -> Result<Vec<String>, DomainError> {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT token FROM device_tokens WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(rows.into_iter().map(|(t,)| t).collect())
    }

    async fn drop_token(&self, token: &str) -> Result<(), DomainError> {
        sqlx::query("DELETE FROM device_tokens WHERE token = $1")
            .bind(token)
            .execute(&self.pool)
            .await
            .map_err(map_sqlx)?;
        Ok(())
    }

    async fn create_notification_event(
        &self,
        recipient_id: Uuid,
        event_type: &str,
        shared_task_id: Option<Uuid>,
        actor_user_id: Option<Uuid>,
        payload_json: &str,
    ) -> Result<Uuid, DomainError> {
        let payload: serde_json::Value = serde_json::from_str(payload_json).unwrap_or_else(|_| {
            serde_json::Value::Object(serde_json::Map::new())
        });
        let row: (Uuid,) = sqlx::query_as(
            "INSERT INTO notification_events
                (recipient_id, event_type, shared_task_id, actor_user_id, payload_json)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id",
        )
        .bind(recipient_id)
        .bind(event_type)
        .bind(shared_task_id)
        .bind(actor_user_id)
        .bind(payload)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(row.0)
    }

    async fn find_notification_events(
        &self,
        recipient_id: Uuid,
        since: Option<DateTime<Utc>>,
        limit: i64,
    ) -> Result<Vec<NotificationEvent>, DomainError> {
        let limit = limit.clamp(1, 200);
        let rows: Vec<(
            Uuid,
            Uuid,
            String,
            Option<Uuid>,
            Option<Uuid>,
            Option<String>,
            Option<String>,
            Option<String>,
            serde_json::Value,
            DateTime<Utc>,
            Option<DateTime<Utc>>,
        )> = sqlx::query_as(
            "SELECT e.id, e.recipient_id, e.event_type, e.shared_task_id, e.actor_user_id,
                    a.username, a.full_name, t.title_preview, e.payload_json,
                    e.created_at, e.ack_at
             FROM notification_events e
             LEFT JOIN users a ON a.id = e.actor_user_id
             LEFT JOIN shared_tasks t ON t.id = e.shared_task_id
             WHERE e.recipient_id = $1
               AND ($2::timestamptz IS NULL OR e.created_at > $2)
             ORDER BY e.created_at DESC
             LIMIT $3",
        )
        .bind(recipient_id)
        .bind(since)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(rows
            .into_iter()
            .map(
                |(
                    id,
                    recipient_id,
                    event_type,
                    shared_task_id,
                    actor_user_id,
                    actor_username,
                    actor_full_name,
                    title_preview,
                    payload_json,
                    created_at,
                    ack_at,
                )| NotificationEvent {
                    id,
                    recipient_id,
                    event_type,
                    shared_task_id,
                    actor_user_id,
                    actor_username,
                    actor_full_name: actor_full_name.map(|s| if s.is_empty() { String::new() } else { s }),
                    title_preview,
                    payload_json: payload_json.to_string(),
                    created_at,
                    ack_at,
                },
            )
            .collect())
    }

    async fn ack_notification_events(
        &self,
        recipient_id: Uuid,
        ids: &[Uuid],
    ) -> Result<(), DomainError> {
        if ids.is_empty() {
            return Ok(());
        }
        sqlx::query(
            "UPDATE notification_events
             SET ack_at = NOW()
             WHERE recipient_id = $1 AND id = ANY($2) AND ack_at IS NULL",
        )
        .bind(recipient_id)
        .bind(ids)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(())
    }

    async fn forward_share(
        &self,
        forwarder_user_id: Uuid,
        shared_task_id: Uuid,
        recipient_ids: &[Uuid],
    ) -> Result<ForwardResult, DomainError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        // El forwarder debe ser un participante elegible: dueño activo o
        // recipient ACCEPTED+OPEN. Si no, error de autorización.
        let (is_owner_active, is_recipient_active): (bool, bool) = {
            let row: (bool, bool) = sqlx::query_as(
                "SELECT
                    EXISTS (
                        SELECT 1 FROM shared_tasks
                        WHERE id = $1 AND owner_user_id = $2 AND owner_unlinked_at IS NULL
                    ) AS is_owner,
                    EXISTS (
                        SELECT 1 FROM shared_task_recipients
                        WHERE shared_task_id = $1 AND recipient_user_id = $2
                          AND status = 'ACCEPTED' AND sub_state = 'OPEN'
                    ) AS is_recipient",
            )
            .bind(shared_task_id)
            .bind(forwarder_user_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(map_sqlx)?;
            row
        };

        if !is_owner_active && !is_recipient_active {
            return Err(DomainError::Unauthorized(
                "No puedes reenviar esta tarea: tu vinculación no está activa".to_string(),
            ));
        }

        let mut result = ForwardResult::default();
        for recipient_id in recipient_ids {
            if *recipient_id == forwarder_user_id {
                continue;
            }
            // Estado previo (si existe) para clasificar el outcome.
            let prior: Option<(String, String)> = sqlx::query_as(
                "SELECT status, sub_state FROM shared_task_recipients
                 WHERE shared_task_id = $1 AND recipient_user_id = $2",
            )
            .bind(shared_task_id)
            .bind(recipient_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_sqlx)?;

            match prior.as_ref().map(|(s, sub)| (s.as_str(), sub.as_str())) {
                Some(("PENDING", _)) => {
                    result.already_invited.push(*recipient_id);
                    continue;
                }
                Some(("ACCEPTED", sub))
                    if matches!(sub, "OPEN" | "COMPLETED" | "DISMISSED_DONE") =>
                {
                    result.already_has_copy.push(*recipient_id);
                    continue;
                }
                _ => {}
            }

            // Inserta o re-escribe (REJECTED / UNLINKED / inexistente → PENDING).
            sqlx::query(
                "INSERT INTO shared_task_recipients
                    (shared_task_id, recipient_user_id, inviter_user_id, status, sub_state, sub_state_at)
                 VALUES ($1, $2, $3, 'PENDING', 'OPEN', NOW())
                 ON CONFLICT (shared_task_id, recipient_user_id) DO UPDATE
                    SET status = 'PENDING',
                        sub_state = 'OPEN',
                        sub_state_at = NOW(),
                        inviter_user_id = EXCLUDED.inviter_user_id,
                        responded_at = NULL,
                        completed_at = NULL,
                        archived_by_recipient_at = NULL",
            )
            .bind(shared_task_id)
            .bind(recipient_id)
            .bind(forwarder_user_id)
            .execute(&mut *tx)
            .await
            .map_err(map_sqlx)?;
            result.invited.push(*recipient_id);
        }

        tx.commit().await.map_err(map_sqlx)?;
        Ok(result)
    }

    async fn unlink_recipient(
        &self,
        user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<Vec<Uuid>, DomainError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        let updated = sqlx::query(
            "UPDATE shared_task_recipients
             SET sub_state = 'UNLINKED',
                 sub_state_at = NOW(),
                 archived_by_recipient_at = NOW()
             WHERE shared_task_id = $1
               AND recipient_user_id = $2
               AND sub_state <> 'UNLINKED'",
        )
        .bind(shared_task_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        if updated.rows_affected() == 0 {
            // No participabas. Best-effort: nada que cancelar.
            return Ok(Vec::new());
        }

        let canceled = cancel_orphans_tx(&mut tx, shared_task_id).await?;
        tx.commit().await.map_err(map_sqlx)?;
        Ok(canceled)
    }

    async fn unlink_owner(
        &self,
        owner_user_id: Uuid,
        shared_task_id: Uuid,
    ) -> Result<Vec<Uuid>, DomainError> {
        let mut tx = self.pool.begin().await.map_err(map_sqlx)?;

        let updated = sqlx::query(
            "UPDATE shared_tasks
             SET owner_unlinked_at = NOW(),
                 archived_by_owner_at = NOW()
             WHERE id = $1 AND owner_user_id = $2 AND owner_unlinked_at IS NULL",
        )
        .bind(shared_task_id)
        .bind(owner_user_id)
        .execute(&mut *tx)
        .await
        .map_err(map_sqlx)?;

        if updated.rows_affected() == 0 {
            return Ok(Vec::new());
        }

        let canceled = cancel_orphans_tx(&mut tx, shared_task_id).await?;
        tx.commit().await.map_err(map_sqlx)?;
        Ok(canceled)
    }

    async fn mark_sub_state(
        &self,
        user_id: Uuid,
        shared_task_id: Uuid,
        sub_state: SubState,
    ) -> Result<Uuid, DomainError> {
        if matches!(sub_state, SubState::Unlinked) {
            return Err(DomainError::BadRequest(
                "Usa unlinkSharedTask para desvincularte".to_string(),
            ));
        }
        let completed_at_expr = match sub_state {
            SubState::Completed | SubState::DismissedDone => "NOW()",
            _ => "NULL",
        };
        let query = format!(
            "UPDATE shared_task_recipients r
             SET sub_state = $3,
                 sub_state_at = NOW(),
                 completed_at = {completed_at_expr}
             FROM shared_tasks t
             WHERE r.shared_task_id = $1
               AND r.recipient_user_id = $2
               AND t.id = r.shared_task_id
               AND r.status = 'ACCEPTED'
               AND r.sub_state <> 'UNLINKED'
             RETURNING t.owner_user_id"
        );
        let row: Option<(Uuid,)> = sqlx::query_as(&query)
            .bind(shared_task_id)
            .bind(user_id)
            .bind(sub_state.as_str())
            .fetch_optional(&self.pool)
            .await
            .map_err(map_sqlx)?;
        row.map(|(o,)| o).ok_or_else(|| {
            DomainError::NotFound(
                "No tienes una copia activa de esta tarea compartida".to_string(),
            )
        })
    }

    async fn count_others_active(
        &self,
        shared_task_id: Uuid,
        viewer_user_id: Uuid,
    ) -> Result<i64, DomainError> {
        let count: (i64,) = sqlx::query_as(
            "SELECT
                (SELECT COUNT(*) FROM shared_task_recipients
                  WHERE shared_task_id = $1
                    AND recipient_user_id <> $2
                    AND ((status = 'ACCEPTED' AND sub_state = 'OPEN')
                         OR status = 'PENDING'))
              + (SELECT COUNT(*) FROM shared_tasks
                  WHERE id = $1
                    AND owner_user_id <> $2
                    AND owner_unlinked_at IS NULL) AS c",
        )
        .bind(shared_task_id)
        .bind(viewer_user_id)
        .fetch_one(&self.pool)
        .await
        .map_err(map_sqlx)?;
        Ok(count.0)
    }

    async fn find_last_survivor(
        &self,
        shared_task_id: Uuid,
    ) -> Result<Option<Uuid>, DomainError> {
        // Une al owner (si no se desvinculó) con los recipients ACCEPTED y no
        // UNLINKED. Si hay exactamente un participante vivo, ese es el
        // sobreviviente al que el servicio notifica con SHARED_TASK_ORPHANED.
        let rows: Vec<(Uuid,)> = sqlx::query_as(
            "SELECT owner_user_id AS user_id
               FROM shared_tasks
              WHERE id = $1 AND owner_unlinked_at IS NULL
             UNION ALL
             SELECT recipient_user_id AS user_id
               FROM shared_task_recipients
              WHERE shared_task_id = $1
                AND status = 'ACCEPTED'
                AND sub_state <> 'UNLINKED'",
        )
        .bind(shared_task_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;
        if rows.len() == 1 {
            Ok(Some(rows[0].0))
        } else {
            Ok(None)
        }
    }

    async fn find_my_shared_tasks(
        &self,
        user_id: Uuid,
        filter: MySharedTasksFilter,
    ) -> Result<Vec<InboxItem>, DomainError> {
        // Mismo shape que find_inbox para que el cliente pueda compartir el
        // modelo. La tab Invitaciones filtra solo PENDING; la tab Linked
        // muestra lo que el usuario tiene en su listado (ACCEPTED+OPEN, ó las
        // tareas que él mismo creó si sigue como dueño no-desvinculado).
        match filter {
            MySharedTasksFilter::Invitations => {
                let rows: Vec<(
                    Uuid,
                    Uuid,
                    String,
                    String,
                    String,
                    String,
                    DateTime<Utc>,
                    String,
                    String,
                    String,
                    Option<String>,
                    Option<Uuid>,
                    Option<String>,
                    Option<String>,
                )> = sqlx::query_as(
                    "SELECT t.id, t.owner_user_id, t.ciphertext, t.enc_key, t.scope,
                            t.title_preview, t.created_at,
                            r.status, r.sub_state, o.username, o.full_name,
                            r.inviter_user_id, iu.username, iu.full_name
                     FROM shared_task_recipients r
                     JOIN shared_tasks t ON t.id = r.shared_task_id
                     JOIN users o ON o.id = t.owner_user_id
                     LEFT JOIN users iu ON iu.id = r.inviter_user_id
                     WHERE r.recipient_user_id = $1
                       AND r.status = 'PENDING'
                       AND r.sub_state <> 'UNLINKED'
                     ORDER BY t.created_at DESC
                     LIMIT 200",
                )
                .bind(user_id)
                .fetch_all(&self.pool)
                .await
                .map_err(map_sqlx)?;
                Ok(rows.into_iter().map(row_to_inbox_item).collect())
            }
            MySharedTasksFilter::Linked => {
                // Tareas vinculadas: lo aceptado y abierto (no UNLINKED), ó
                // las creadas por el usuario y aún no desvinculadas.
                let rows: Vec<(
                    Uuid,
                    Uuid,
                    String,
                    String,
                    String,
                    String,
                    DateTime<Utc>,
                    String,
                    String,
                    String,
                    Option<String>,
                    Option<Uuid>,
                    Option<String>,
                    Option<String>,
                )> = sqlx::query_as(
                    "SELECT t.id, t.owner_user_id, t.ciphertext, t.enc_key, t.scope,
                            t.title_preview, t.created_at,
                            COALESCE(r.status, 'OWNER') AS status,
                            COALESCE(r.sub_state, 'OPEN') AS sub_state,
                            o.username, o.full_name,
                            r.inviter_user_id, iu.username, iu.full_name
                     FROM shared_tasks t
                     JOIN users o ON o.id = t.owner_user_id
                     LEFT JOIN shared_task_recipients r
                            ON r.shared_task_id = t.id AND r.recipient_user_id = $1
                     LEFT JOIN users iu ON iu.id = r.inviter_user_id
                     WHERE (
                            (t.owner_user_id = $1 AND t.owner_unlinked_at IS NULL)
                         OR (r.recipient_user_id = $1
                             AND r.status = 'ACCEPTED'
                             AND r.sub_state <> 'UNLINKED')
                       )
                     ORDER BY t.created_at DESC
                     LIMIT 200",
                )
                .bind(user_id)
                .fetch_all(&self.pool)
                .await
                .map_err(map_sqlx)?;
                Ok(rows.into_iter().map(row_to_inbox_item).collect())
            }
        }
    }
}

fn row_to_inbox_item(
    row: (
        Uuid,
        Uuid,
        String,
        String,
        String,
        String,
        DateTime<Utc>,
        String,
        String,
        String,
        Option<String>,
        Option<Uuid>,
        Option<String>,
        Option<String>,
    ),
) -> InboxItem {
    let (
        id,
        owner_user_id,
        ciphertext,
        enc_key,
        scope,
        title_preview,
        created_at,
        status,
        sub_state,
        owner_username,
        owner_full_name,
        inviter_user_id,
        inviter_username,
        inviter_full_name,
    ) = row;
    InboxItem {
        shared_task: SharedTask {
            id,
            owner_user_id,
            ciphertext,
            enc_key,
            scope,
            title_preview,
            created_at,
        },
        status,
        sub_state,
        owner_username,
        owner_full_name: owner_full_name.unwrap_or_default(),
        inviter_user_id,
        inviter_username,
        inviter_full_name,
    }
}

/// Cancela las invitaciones PENDING de un shared_task si quedan menos de 2
/// participantes ACCEPTED+OPEN. Devuelve los recipient_user_id afectados para
/// que el servicio emita `INVITATION_CANCELED` durables. Se ejecuta dentro de
/// una transacción con `SELECT … FOR UPDATE` para evitar carreras.
async fn cancel_orphans_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    shared_task_id: Uuid,
) -> Result<Vec<Uuid>, DomainError> {
    // Lock pesimista sobre la fila del shared_task para serializar
    // desvinculaciones concurrentes.
    sqlx::query("SELECT id FROM shared_tasks WHERE id = $1 FOR UPDATE")
        .bind(shared_task_id)
        .execute(&mut **tx)
        .await
        .map_err(map_sqlx)?;

    let active: (i64,) = sqlx::query_as(
        "SELECT
            (SELECT COUNT(*) FROM shared_task_recipients
              WHERE shared_task_id = $1
                AND status = 'ACCEPTED' AND sub_state = 'OPEN')
          + (SELECT COUNT(*) FROM shared_tasks
              WHERE id = $1 AND owner_unlinked_at IS NULL)",
    )
    .bind(shared_task_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_sqlx)?;

    if active.0 >= 2 {
        return Ok(Vec::new());
    }

    let canceled: Vec<(Uuid,)> = sqlx::query_as(
        "UPDATE shared_task_recipients
         SET status = 'REJECTED',
             sub_state = 'UNLINKED',
             sub_state_at = NOW(),
             responded_at = NOW()
         WHERE shared_task_id = $1 AND status = 'PENDING'
         RETURNING recipient_user_id",
    )
    .bind(shared_task_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(map_sqlx)?;

    Ok(canceled.into_iter().map(|(id,)| id).collect())
}
