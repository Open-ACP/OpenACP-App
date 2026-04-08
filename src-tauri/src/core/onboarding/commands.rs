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

/// Returns true if ~/.openacp/config.json exists.
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

/// Runs `openacp setup --global --workspace <workspace> --agent <agent>
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

/// Dev-only: removes ~/.openacp config dir and the openacp binary.
/// Used to reset onboarding state during development.
#[allow(dead_code)]
#[tauri::command]
pub async fn dev_reset_openacp(app: tauri::AppHandle) -> Result<(), String> {
    setup::dev_reset(&app).await
}
