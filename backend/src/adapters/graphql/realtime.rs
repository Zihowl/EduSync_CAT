use std::{pin::Pin, sync::Arc};

use async_graphql::{Context, Enum, SimpleObject, Subscription};
use futures_util::stream::{self, Stream};
use tokio::sync::broadcast;

#[derive(Enum, Copy, Clone, Debug, Eq, PartialEq)]
pub enum RealtimeScope {
    AllowedDomains,
    CurrentSchoolYear,
    AuditLogs,
    Users,
    Teachers,
    Subjects,
    Buildings,
    Classrooms,
    Groups,
    Schedules,
}

#[derive(SimpleObject, Clone)]
pub struct RealtimeEvent {
    pub scopes: Vec<RealtimeScope>,
}

#[derive(Clone)]
pub struct RealtimeBroadcaster {
    sender: broadcast::Sender<RealtimeEvent>,
}

impl RealtimeBroadcaster {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(256);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<RealtimeEvent> {
        self.sender.subscribe()
    }

    pub fn publish_scopes(&self, scopes: &[RealtimeScope]) {
        let _ = self.sender.send(RealtimeEvent {
            scopes: scopes.to_vec(),
        });
    }
}

pub fn publish_realtime_event(ctx: &Context<'_>, scopes: &[RealtimeScope]) {
    if let Some(broadcaster) = ctx.data_opt::<Arc<RealtimeBroadcaster>>() {
        broadcaster.publish_scopes(scopes);
    }
}

#[derive(Default)]
pub struct RealtimeSubscription;

#[Subscription]
impl RealtimeSubscription {
    #[graphql(name = "RealtimeEvents")]
    async fn realtime_events(&self, ctx: &Context<'_>) -> Pin<Box<dyn Stream<Item = RealtimeEvent> + Send>> {
        let broadcaster = ctx.data_unchecked::<Arc<RealtimeBroadcaster>>().clone();
        let receiver = broadcaster.subscribe();

        Box::pin(stream::unfold(receiver, |mut receiver| async move {
            loop {
                match receiver.recv().await {
                    Ok(event) => return Some((event, receiver)),
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => return None,
                }
            }
        }))
    }
}
