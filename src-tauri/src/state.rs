use crate::core::pty::PtyManager;
use crate::core::sidecar::manager::SidecarManager;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub sidecar: Arc<Mutex<SidecarManager>>,
    pub pty: Arc<Mutex<PtyManager>>,
}
