mod onboarding;
mod sidecar;

use sidecar::SidecarManager;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

// TODO: Replace with OS credential store (e.g., `keyring` crate) for production.
// Currently stores tokens as plaintext JSON in app data dir — acceptable for MVP only.
static KEYCHAIN: std::sync::Mutex<Option<HashMap<String, String>>> = std::sync::Mutex::new(None);

struct AppState {
    sidecar: Arc<Mutex<SidecarManager>>,
}

#[tauri::command]
async fn get_server_info(state: tauri::State<'_, AppState>) -> Result<ServerInfo, String> {
    let mgr = state.sidecar.lock().await;
    mgr.server_info()
        .ok_or_else(|| "Server not ready".to_string())
}

#[derive(Clone, serde::Serialize)]
struct InstanceInfo {
    id: String,
    root: String,      // path to .openacp dir
    workspace: String, // parent of root (workspace root dir)
}

fn read_instances_json() -> Result<serde_json::Value, String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    let path = home.join(".openacp").join("instances.json");
    if !path.exists() {
        return Ok(serde_json::json!({ "instances": {} }));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn parse_instances(value: &serde_json::Value) -> Vec<InstanceInfo> {
    let mut result = Vec::new();
    let Some(instances) = value.get("instances").and_then(|v| v.as_object()) else {
        return result;
    };
    for (id, entry) in instances {
        let Some(root) = entry.get("root").and_then(|r| r.as_str()) else { continue };
        let p = std::path::PathBuf::from(root);
        let workspace = if p.file_name().map(|n| n == ".openacp").unwrap_or(false) {
            p.parent().map(|pp| pp.to_string_lossy().to_string())
        } else {
            Some(root.to_string())
        };
        if let Some(workspace) = workspace {
            result.push(InstanceInfo {
                id: id.clone(),
                root: root.to_string(),
                workspace,
            });
        }
    }
    result
}

/// Read server info for an instance by ID, using its root from instances.json
#[tauri::command]
async fn get_workspace_server_info(instance_id: String) -> Result<ServerInfo, String> {
    let value = read_instances_json()?;
    let instances = parse_instances(&value);
    let instance = instances
        .into_iter()
        .find(|i| i.id == instance_id)
        .ok_or_else(|| format!("Instance '{instance_id}' not found in instances.json"))?;

    let dir = std::path::PathBuf::from(&instance.root);

    let token = std::fs::read_to_string(dir.join("api-secret"))
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

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
fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
async fn invoke_cli(args: Vec<String>, _app: tauri::AppHandle) -> Result<String, String> {
    use sidecar::find_openacp_binary_pub;
    let bin = find_openacp_binary_pub().ok_or_else(|| "Could not find openacp binary".to_string())?;
    let output = tokio::process::Command::new(&bin)
        .args(&args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(if stderr.is_empty() {
            format!("CLI exited with status: {}", output.status)
        } else {
            stderr
        })
    }
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

#[tauri::command]
fn keychain_set(key: String, value: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut lock = KEYCHAIN.lock().map_err(|e| e.to_string())?;
    let map = lock.get_or_insert_with(HashMap::new);
    map.insert(key, value);
    // Persist to app data dir
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let keychain_path = data_dir.join("keychain.json");
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(&keychain_path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn keychain_get(key: String, app: tauri::AppHandle) -> Result<Option<String>, String> {
    let mut lock = KEYCHAIN.lock().map_err(|e| e.to_string())?;
    if lock.is_none() {
        // Load from disk on first access
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let keychain_path = data_dir.join("keychain.json");
        if keychain_path.exists() {
            let raw = std::fs::read_to_string(&keychain_path).map_err(|e| e.to_string())?;
            let map: HashMap<String, String> = serde_json::from_str(&raw).unwrap_or_default();
            *lock = Some(map);
        } else {
            *lock = Some(HashMap::new());
        }
    }
    Ok(lock.as_ref().and_then(|m| m.get(&key).cloned()))
}

#[tauri::command]
fn keychain_delete(key: String, app: tauri::AppHandle) -> Result<(), String> {
    let mut lock = KEYCHAIN.lock().map_err(|e| e.to_string())?;
    if let Some(map) = lock.as_mut() {
        map.remove(&key);
        let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let keychain_path = data_dir.join("keychain.json");
        let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
        std::fs::write(&keychain_path, json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "openacp_lib=debug".parse().unwrap()),
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
            path_exists,
            invoke_cli,
            start_server,
            stop_server,
            onboarding::check_openacp_installed,
            onboarding::check_openacp_config,
            onboarding::check_core_update,
            onboarding::run_install_script,
            onboarding::run_openacp_setup,
            onboarding::run_openacp_agents_list,
            onboarding::run_openacp_agent_install,
            onboarding::dev_reset_openacp,
            keychain_set,
            keychain_get,
            keychain_delete,
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
