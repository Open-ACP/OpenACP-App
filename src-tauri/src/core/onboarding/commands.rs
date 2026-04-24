use super::installer;
use super::setup;

/// Runs `openacp --version` and returns the version string, or None if not installed.
/// Uses find_openacp_binary to locate the binary (handles release builds where PATH is limited).
#[tauri::command]
pub async fn check_openacp_installed(_app: tauri::AppHandle) -> Result<Option<String>, String> {
    setup::check_installed().await
}

/// Returns the resolved path to the openacp binary, or None if not found.
#[tauri::command]
pub async fn get_openacp_binary_path() -> Result<Option<String>, String> {
    use crate::core::sidecar::binary::find_openacp_binary;
    Ok(find_openacp_binary().map(|(path, _)| path.to_string_lossy().to_string()))
}

/// Returns true if at least one OpenACP instance is registered.
#[tauri::command]
pub async fn check_openacp_config() -> Result<bool, String> {
    setup::check_config()
}

/// Calls the npm registry to check if a newer @openacp/cli version is available.
/// Returns None if already up to date or check fails (network error, etc.).
#[tauri::command]
pub async fn check_core_update(
    _app: tauri::AppHandle,
) -> Result<Option<setup::CoreUpdateInfo>, String> {
    setup::check_update().await
}

/// Runs the openacp install script for the current OS.
/// Streams stdout/stderr line-by-line via the "install-output" Tauri event.
/// Returns Ok(()) on success, Err(message) on non-zero exit.
#[tauri::command]
pub async fn run_install_script(app: tauri::AppHandle) -> Result<(), String> {
    installer::run_install(&app).await
}

/// Runs `openacp setup --dir <workspace> --agent <agent>
///   --run-mode daemon --json` and streams output via "setup-output" event.
/// Returns the JSON result string from the CLI on success.
#[tauri::command]
pub async fn run_openacp_setup(
    app: tauri::AppHandle,
    workspace: String,
    agent: String,
) -> Result<String, String> {
    setup::run_setup(&app, &workspace, &agent).await
}

/// Runs `openacp agents list --json` and returns the raw JSON string.
#[allow(dead_code)]
#[tauri::command]
pub async fn run_openacp_agents_list(_app: tauri::AppHandle, workspace_dir: Option<String>) -> Result<String, String> {
    setup::agents_list(workspace_dir).await
}

/// Runs `openacp agents install <agent_key>`, streaming output via "agent-install-output".
#[tauri::command]
pub async fn run_openacp_agent_install(
    app: tauri::AppHandle,
    agent_key: String,
    workspace_dir: Option<String>,
) -> Result<(), String> {
    setup::agent_install(&app, &agent_key, workspace_dir.as_deref()).await
}

/// Returns Node.js version and path, or None if not found.
/// Prefers the node binary co-located with the openacp binary (same nvm/fnm version)
/// to avoid mismatch when multiple node installations exist (brew + nvm).
#[tauri::command]
pub async fn get_node_info() -> Result<Option<(String, String)>, String> {
    use crate::core::sidecar::binary::find_openacp_binary;

    // Strategy 1: Find node in the same directory as openacp binary
    // This ensures we report the node that actually runs openacp
    if let Some((openacp_bin, _)) = find_openacp_binary() {
        if let Some(bin_dir) = openacp_bin.parent() {
            let node_path = bin_dir.join("node");
            if node_path.exists() {
                if let Ok(output) = tokio::process::Command::new(&node_path)
                    .arg("--version")
                    .output()
                    .await
                {
                    if output.status.success() {
                        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        return Ok(Some((version, node_path.to_string_lossy().to_string())));
                    }
                }
            }
        }
    }

    // Strategy 2: Use `which node` with the cached shell_env PATH. Replaces
    // the old shell -i/-l spawn loop, same noise-immunity rules apply
    // (stdout authoritative, exit code ignored).
    let which_bin = if cfg!(windows) { "where" } else { "/usr/bin/which" };
    if let Ok(output) = tokio::process::Command::new(which_bin)
        .arg("node")
        .env("PATH", crate::core::shell_env::path())
        .output()
        .await
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let path = stdout.trim().lines().next().unwrap_or("").trim();
        let is_valid = if cfg!(windows) {
            !path.is_empty()
        } else {
            path.starts_with('/')
        };
        if is_valid {
            if let Ok(version_output) = tokio::process::Command::new(path)
                .arg("--version")
                .env("PATH", crate::core::shell_env::path())
                .output()
                .await
            {
                if version_output.status.success() {
                    let version = String::from_utf8_lossy(&version_output.stdout)
                        .trim()
                        .to_string();
                    return Ok(Some((version, path.to_string())));
                }
            }
        }
    }

    Ok(None)
}

/// Returns all debug/diagnostic info in one call for "Copy Debug Info".
#[tauri::command]
pub async fn get_debug_info(app: tauri::AppHandle) -> Result<std::collections::HashMap<String, String>, String> {
    use crate::core::sidecar::binary::{find_openacp_binary, resolve_openacp_launcher};
    let mut info = std::collections::HashMap::new();

    // App version from Tauri config
    info.insert("app_version".into(), app.package_info().version.to_string());

    // Core version + path
    match setup::check_installed().await {
        Ok(Some(v)) => { info.insert("core_version".into(), v); }
        _ => { info.insert("core_version".into(), "Not installed".into()); }
    }
    if let Some((path, _)) = find_openacp_binary() {
        info.insert("core_path".into(), path.to_string_lossy().to_string());
    }

    // Launcher info — shows whether we resolved an explicit node+entry for
    // openacp or fell back to the shim. Critical for debugging multi-node
    // install failures.
    match resolve_openacp_launcher() {
        Some(launcher) => {
            info.insert(
                "openacp_launcher".into(),
                format!("explicit node ({})", launcher.node.display()),
            );
            info.insert(
                "openacp_entry".into(),
                launcher.entry.to_string_lossy().to_string(),
            );
        }
        None => {
            info.insert("openacp_launcher".into(), "shim + env node (fallback)".into());
        }
    }

    // Node version + path (reuse get_node_info which prefers co-located node)
    match get_node_info().await {
        Ok(Some((version, path))) => {
            info.insert("node_version".into(), version);
            info.insert("node_path".into(), path);
        }
        _ => {
            info.insert("node_version".into(), "Not found".into());
        }
    }

    // OS
    info.insert("os".into(), format!("{} {}", std::env::consts::OS, std::env::consts::ARCH));

    // Shell env snapshot — crucial for debugging future PATH issues
    let snap = crate::core::shell_env::snapshot();
    info.insert(
        "shell_env_resolved_via".into(),
        snap.resolved_via
            .clone()
            .unwrap_or_else(|| "fallback (std::env)".into()),
    );
    info.insert("shell_env_path".into(), snap.path.clone());
    info.insert("shell_env_vars_count".into(), snap.vars.len().to_string());

    // Config status
    match setup::check_config() {
        Ok(true) => {
            // Count instances
            if let Some(home) = dirs::home_dir() {
                let path = home.join(".openacp").join("instances.json");
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        let count = json.get("instances")
                            .and_then(|v| v.as_object())
                            .map_or(0, |m| m.len());
                        info.insert("config".into(), format!("yes ({count} instances)"));
                    } else {
                        info.insert("config".into(), "yes (parse error)".into());
                    }
                }
            }
        }
        Ok(false) => { info.insert("config".into(), "no".into()); }
        Err(e) => { info.insert("config".into(), format!("error: {e}")); }
    }

    // Log file path
    if let Some(path) = crate::core::logging::log_file_path() {
        info.insert("log_path".into(), path);
    }

    Ok(info)
}

/// Dev-only: removes ~/.openacp config dir and the openacp binary.
/// Used to reset onboarding state during development.
#[allow(dead_code)]
#[tauri::command]
pub async fn dev_reset_openacp(app: tauri::AppHandle) -> Result<(), String> {
    setup::dev_reset(&app).await
}
