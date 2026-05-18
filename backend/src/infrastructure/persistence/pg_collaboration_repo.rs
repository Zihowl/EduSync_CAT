use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::domain::{
    errors::DomainError,
    models::shared_task::{
        AcademicProfile, InboxItem, OutboxItem, RecipientStatus, ShareCandidate, SharedTask,
    },
    ports::collaboration_repository::CollaborationRepository,
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
             SET group_id = EXCLUDED.group_id,
                 subgroup_id = EXCLUDED.subgroup_id,
                 updated_at = NOW()",
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
    ) -> Result<Vec<ShareCandidate>, DomainError> {
        let search_pattern = search
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty())
            .map(|s| format!("%{s}%"));

        let rows: Vec<(Uuid, String, String, String)> = sqlx::query_as(
            "SELECT DISTINCT u.id, u.username, u.full_name, u.role::text AS role
             FROM users u
             LEFT JOIN user_academic_profiles p ON p.user_id = u.id
             WHERE u.id <> $1
               AND u.is_active = TRUE
               AND u.role IN ('STUDENT', 'TEACHER')
               AND (
                    ($2::int IS NOT NULL AND p.group_id = $2)
                 OR ($3::int IS NOT NULL AND p.subgroup_id = $3)
                 OR ($4::text IS NOT NULL AND lower(u.username) LIKE $4)
               )
             ORDER BY u.full_name
             LIMIT 100",
        )
        .bind(exclude_user_id)
        .bind(group_id)
        .bind(subgroup_id)
        .bind(search_pattern)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;

        Ok(rows
            .into_iter()
            .map(|(user_id, username, full_name, role)| ShareCandidate {
                user_id,
                username,
                full_name,
                role,
            })
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
                "INSERT INTO shared_task_recipients (shared_task_id, recipient_user_id)
                 VALUES ($1, $2)
                 ON CONFLICT (shared_task_id, recipient_user_id) DO NOTHING",
            )
            .bind(row.id)
            .bind(recipient_id)
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
        )> = sqlx::query_as(
            "SELECT t.id, t.owner_user_id, t.ciphertext, t.enc_key, t.scope, t.title_preview,
                    t.created_at, r.status, o.username, o.full_name
             FROM shared_task_recipients r
             JOIN shared_tasks t ON t.id = r.shared_task_id
             JOIN users o ON o.id = t.owner_user_id
             WHERE r.recipient_user_id = $1
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
                    owner_username,
                    owner_full_name,
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
                    owner_username,
                    owner_full_name,
                },
            )
            .collect())
    }

    async fn find_outbox(&self, owner_user_id: Uuid) -> Result<Vec<OutboxItem>, DomainError> {
        let tasks = sqlx::query_as::<_, SharedTaskRow>(&format!(
            "SELECT {SHARED_TASK_COLUMNS} FROM shared_tasks
             WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 200"
        ))
        .bind(owner_user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(map_sqlx)?;

        let mut items = Vec::with_capacity(tasks.len());
        for task in tasks {
            let recipients: Vec<(Uuid, String, String, String, i64)> = sqlx::query_as(
                "SELECT r.recipient_user_id, u.username, u.full_name, r.status,
                        (SELECT COUNT(*) FROM task_reminders tr
                         WHERE tr.shared_task_id = r.shared_task_id
                           AND tr.sender_user_id = $2
                           AND tr.recipient_user_id = r.recipient_user_id
                           AND tr.created_at > NOW() - INTERVAL '24 hours') AS reminders
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
                        |(user_id, username, full_name, status, reminders_sent_24h)| {
                            RecipientStatus {
                                user_id,
                                username,
                                full_name,
                                status,
                                reminders_sent_24h,
                            }
                        },
                    )
                    .collect(),
            });
        }
        Ok(items)
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
}
