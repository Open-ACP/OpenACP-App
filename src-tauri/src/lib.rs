mod sidecar;

use sidecar::SidecarManager;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

struct AppState {
    sidecar: Arc<Mutex<SidecarManager>>,
}

#[tauri::command]
async fn get_server_info(state: tauri::State<'_, AppState>) -> Result<ServerInfo, String> {
    let mgr = state.sidecar.lock().await;
    mgr.server_info()
        .ok_or_else(|| "Server not ready".to_string())
}

/// Read server info from a workspace's `.openacp/` directory
#[tauri::command]
async fn get_workspace_server_info(directory: String) -> Result<ServerInfo, String> {
    let dir = std::path::PathBuf::from(&directory).join(".openacp");
    if !dir.exists() {
        return Err(format!("No .openacp directory found in {directory}"));
    }

    let token = std::fs::read_to_string(dir.join("api-secret"))
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    // Read api.port
    if let Ok(port_str) = std::fs::read_to_string(dir.join("api.port")) {
        if let Ok(port) = port_str.trim().parse::<u16>() {
            return Ok(ServerInfo {
                url: format!("http://127.0.0.1:{port}"),
                token,
            });
        }
    }

    // Fallback: config.json
    if let Ok(config_str) = std::fs::read_to_string(dir.join("config.json")) {
        if let Ok(config) = serde_json::from_str::<serde_json::Value>(&config_str) {
            if let Some(port) = config.get("api").and_then(|a| a.get("port")).and_then(|p| p.as_u64()) {
                let host = config.get("api")
                    .and_then(|a| a.get("host"))
                    .and_then(|h| h.as_str())
                    .unwrap_or("127.0.0.1");
                return Ok(ServerInfo {
                    url: format!("http://{host}:{port}"),
                    token,
                });
            }
        }
    }

    Err(format!("Could not determine port from {}", dir.display()))
}

#[tauri::command]
async fn start_server(state: tauri::State<'_, AppState>) -> Result<ServerInfo, String> {
    let mut mgr = state.sidecar.lock().await;
    mgr.start().await.map_err(|e| e.to_string())?;

    // Wait for health check
    let info = mgr
        .server_info()
        .ok_or_else(|| "Server started but info not available".to_string())?;
    Ok(info)
}

#[tauri::command]
async fn stop_server(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.sidecar.lock().await;
    mgr.stop().await;
    Ok(())
}

#[derive(Clone, serde::Serialize)]
pub struct ServerInfo {
    pub url: String,
    pub token: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "openacp_lib=info".parse().unwrap()),
        )
        .init();

    let sidecar = Arc::new(Mutex::new(SidecarManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            get_server_info,
            get_workspace_server_info,
            start_server,
            stop_server,
        ])
        .setup(move |app| {
            app.manage(AppState {
                sidecar: sidecar.clone(),
            });

            // Auto-start: try to detect already-running OpenACP server
            let sidecar_clone = sidecar.clone();
            tauri::async_runtime::spawn(async move {
                let mut mgr = sidecar_clone.lock().await;
                if mgr.detect_running().await {
                    tracing::info!("Detected running OpenACP server");
                } else {
                    tracing::info!("No running server detected — will connect on user action");
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                tracing::info!("App exiting");
                // Note: we don't kill the sidecar on exit because OpenACP
                // server may be used by other clients (Telegram, etc.)
            }
        });
}
