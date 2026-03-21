pub mod api;
pub mod telemetry;

use std::collections::HashMap;
use std::sync::Arc;

use axum::Router;
use tokio::sync::{broadcast, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

use cortex::config::RobotConfig;
use cortex::motor::Motor;

use crate::telemetry::TelemetrySnapshot;

pub struct AppState {
    pub config: RobotConfig,
    pub motors: Mutex<HashMap<u8, Motor>>,
    pub telemetry_tx: broadcast::Sender<TelemetrySnapshot>,
    /// Base64-encoded SHA-256 hash of the WebTransport server certificate.
    pub cert_hash_b64: String,
    /// Port the WebTransport (QUIC) server listens on.
    pub wt_port: u16,
}

pub fn build_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api = Router::new()
        .nest("/api", api::routes())
        .layer(cors)
        .with_state(state);

    let spa = ServeDir::new("link/dist").fallback(ServeFile::new("link/dist/index.html"));

    api.fallback_service(spa)
}
