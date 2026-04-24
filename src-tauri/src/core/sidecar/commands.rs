#[cfg(unix)]
extern crate libc;

use crate::state::AppState;
use crate::ServerInfo;

#[derive(Clone, serde::Serialize)]
pub struct InstanceInfo {
    pub id: String,
    pub root: String,      // path to .openacp dir
    pub workspace: String, // parent of root (workspace root dir)
}

/// Expand a leading `~/` to the user's home directory.
/// PathBuf::from("~/foo") does NOT expand tilde — must do it explicitly.
fn expand_tilde(path: &str) -> std::path::PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    std::path::PathBuf::from(path)
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
        let Some(root) = entry.get("root").and_then(|r| r.as_str()) else {
            continue;
        };
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

#[tauri::command]
pub async fn get_server_info(state: tauri::State<'_, AppState>) -> Result<ServerInfo, String> {
    let mgr = state.sidecar.lock().await;
    mgr.server_info()
        .ok_or_else(|| "Server not ready".to_string())
}

/// Read server info for an instance by ID, using its root from instances.json
#[tauri::command]
pub async fn get_workspace_server_info(instance_id: String) -> Result<ServerInfo, String> {
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
            if let Some(port) = config
                .get("api")
                .and_then(|a| a.get("port"))
                .and_then(|p| p.as_u64())
            {
                let host = config
                    .get("api")
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

    Err(format!(
        "Could not determine port from {}",
        dir.display()
    ))
}

/// Resolve server info directly from a workspace directory (fallback when instance not in instances.json)
#[tauri::command]
pub async fn get_workspace_server_info_from_dir(directory: String) -> Result<ServerInfo, String> {
    let dir = expand_tilde(&directory).join(".openacp");

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
            if let Some(port) = config
                .get("api")
                .and_then(|a| a.get("port"))
                .and_then(|p| p.as_u64())
            {
                let host = config
                    .get("api")
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

    Err(format!(
        "Could not determine server info from {}",
        dir.display()
    ))
}

/// Remove an instance from instances.json registry
#[tauri::command]
pub async fn remove_instance_registration(instance_id: String) -> Result<(), String> {
    let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    let path = home.join(".openacp").join("instances.json");
    if !path.exists() {
        return Ok(());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut value: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if let Some(instances) = value.get_mut("instances").and_then(|v| v.as_object_mut()) {
        instances.remove(&instance_id);
    }
    let updated = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    std::fs::write(&path, updated).map_err(|e| e.to_string())?;
    Ok(())
}

/// List all registered local instances by reading filesystem directly (no CLI subprocess)
#[derive(Clone, serde::Serialize)]
pub struct InstanceListEntry {
    pub id: String,
    pub name: Option<String>,
    pub directory: String,
    pub root: String,
    pub status: String, // "running" | "stopped"
    pub port: Option<u16>,
}

#[cfg(unix)]
fn pid_alive(pid: i32) -> bool {
    unsafe { libc::kill(pid as libc::c_int, 0) == 0 }
}

#[cfg(windows)]
fn pid_alive(_pid: u32) -> bool {
    false
}

#[tauri::command]
pub async fn list_local_instances() -> Result<Vec<InstanceListEntry>, String> {
    let value = read_instances_json()?;
    let Some(instances) = value.get("instances").and_then(|v| v.as_object()) else {
        return Ok(vec![]);
    };

    let mut result = Vec::new();
    for (id, entry) in instances {
        let Some(root_str) = entry.get("root").and_then(|r| r.as_str()) else {
            continue;
        };
        let root = expand_tilde(root_str);

        // directory = parent of root if root ends with .openacp, else root itself
        let directory = if root.file_name().map(|n| n == ".openacp").unwrap_or(false) {
            root.parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| root_str.to_string())
        } else {
            root.to_string_lossy().to_string()
        };

        // Read instance name from config.json
        let name = std::fs::read_to_string(root.join("config.json"))
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.get("instanceName")?.as_str().map(String::from));

        // Check liveness via PID file
        let mut status = "stopped".to_string();
        if let Ok(pid_str) = std::fs::read_to_string(root.join("openacp.pid")) {
            #[cfg(unix)]
            if let Ok(pid) = pid_str.trim().parse::<i32>() {
                if pid_alive(pid) {
                    status = "running".to_string();
                }
            }
            #[cfg(windows)]
            if let Ok(pid) = pid_str.trim().parse::<u32>() {
                if pid_alive(pid) {
                    status = "running".to_string();
                }
            }
        }

        // Read port
        let port = std::fs::read_to_string(root.join("api.port"))
            .ok()
            .and_then(|s| s.trim().parse::<u16>().ok());

        result.push(InstanceListEntry {
            id: id.clone(),
            name,
            directory,
            root: root_str.to_string(),
            status,
            port,
        });
    }

    Ok(result)
}

/// Check if an OpenACP daemon is alive for a workspace by reading its PID file
#[tauri::command]
pub async fn check_workspace_server_alive(directory: String) -> Result<bool, String> {
    let pid_path = expand_tilde(&directory).join(".openacp").join("openacp.pid");
    if !pid_path.exists() {
        return Ok(false);
    }
    let pid_str = std::fs::read_to_string(&pid_path).map_err(|e| e.to_string())?;
    let pid: i32 = pid_str.trim().parse().map_err(|_| "Invalid PID".to_string())?;

    // Check if process is alive (signal 0 = check existence)
    let alive = std::process::Command::new("kill")
        .args(["-0", &pid.to_string()])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    Ok(alive)
}

/// Read comprehensive workspace status from filesystem (no CLI needed)
#[derive(Clone, serde::Serialize)]
pub struct WorkspaceStatus {
    pub has_config: bool,
    pub has_pid: bool,
    pub server_alive: bool,
    pub port: Option<u16>,
    pub instance_name: Option<String>,
    pub instance_id: Option<String>, // UUID from config.json "id" field
}

#[tauri::command]
pub async fn get_workspace_status(directory: String) -> Result<WorkspaceStatus, String> {
    let openacp_dir = expand_tilde(&directory).join(".openacp");

    let has_config = openacp_dir.join("config.json").exists();

    // Read instance name and UUID from config
    let config_value = std::fs::read_to_string(openacp_dir.join("config.json"))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());

    let instance_name = config_value
        .as_ref()
        .and_then(|v| v.get("instanceName")?.as_str().map(String::from));

    let instance_id = config_value
        .as_ref()
        .and_then(|v| v.get("id")?.as_str().map(String::from));

    // Check PID
    let mut has_pid = false;
    let mut server_alive = false;
    if let Ok(pid_str) = std::fs::read_to_string(openacp_dir.join("openacp.pid")) {
        has_pid = true;
        if let Ok(pid) = pid_str.trim().parse::<i32>() {
            #[cfg(unix)]
            {
                server_alive = std::process::Command::new("kill")
                .args(["-0", &pid.to_string()])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            }
        }
    }

    // Read port
    let port = std::fs::read_to_string(openacp_dir.join("api.port"))
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok());

    Ok(WorkspaceStatus {
        has_config,
        has_pid,
        server_alive,
        port,
        instance_name,
        instance_id,
    })
}

#[tauri::command]
pub async fn start_server(state: tauri::State<'_, AppState>) -> Result<ServerInfo, String> {
    let mut mgr = state.sidecar.lock().await;
    mgr.start().await.map_err(|e| e.to_string())?;

    // Wait for health check
    let info = mgr
        .server_info()
        .ok_or_else(|| "Server started but info not available".to_string())?;
    Ok(info)
}

#[tauri::command]
pub async fn stop_server(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut mgr = state.sidecar.lock().await;
    mgr.stop().await;
    Ok(())
}
