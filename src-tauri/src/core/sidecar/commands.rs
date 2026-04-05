use crate::state::AppState;
use crate::ServerInfo;

#[derive(Clone, serde::Serialize)]
pub struct InstanceInfo {
    pub id: String,
    pub root: String,      // path to .openacp dir
    pub workspace: String, // parent of root (workspace root dir)
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
