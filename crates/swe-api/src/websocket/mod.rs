//! WebSocket handler for live agent streaming.

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// WebSocket stream event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
    /// Agent status change
    AgentStatus {
        agent_id: Uuid,
        status: String,
        role: String,
    },
    /// Agent activity (what it's doing)
    AgentActivity {
        agent_id: Uuid,
        activity: String,
        detail: Option<String>,
    },
    /// New artifact produced
    ArtifactCreated {
        artifact_id: Uuid,
        name: String,
        artifact_type: String,
    },
    /// Project phase change
    PhaseChange {
        project_id: Uuid,
        from: String,
        to: String,
    },
    /// Chat message from agent
    ChatMessage {
        agent_id: Uuid,
        agent_name: String,
        content: String,
    },
    /// Human interaction requested
    InteractionRequested {
        interaction_id: Uuid,
        prompt: String,
        interaction_type: String,
    },
    /// Heartbeat
    Heartbeat {
        timestamp: chrono::DateTime<chrono::Utc>,
    },
}

/// WebSocket upgrade handler.
pub async fn stream_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

/// Handle a WebSocket connection.
async fn handle_socket(mut socket: WebSocket) {
    tracing::info!("WebSocket client connected");

    // Send initial heartbeat
    let heartbeat = StreamEvent::Heartbeat {
        timestamp: chrono::Utc::now(),
    };
    if let Ok(json) = serde_json::to_string(&heartbeat) {
        let _ = socket.send(Message::Text(json.into())).await;
    }

    // Main loop - would subscribe to event bus and forward events
    loop {
        tokio::select! {
            // Handle incoming messages from client
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        tracing::debug!("Received from client: {}", text);
                        // Handle client commands (subscribe to project, etc.)
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        tracing::info!("WebSocket client disconnected");
                        break;
                    }
                    _ => {}
                }
            }
            // Periodic heartbeat
            _ = tokio::time::sleep(tokio::time::Duration::from_secs(30)) => {
                let heartbeat = StreamEvent::Heartbeat {
                    timestamp: chrono::Utc::now(),
                };
                if let Ok(json) = serde_json::to_string(&heartbeat) {
                    if socket.send(Message::Text(json.into())).await.is_err() {
                        break;
                    }
                }
            }
        }
    }
}
