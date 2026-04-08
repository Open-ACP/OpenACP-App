mod core;
mod error;
mod state;

use core::sidecar::manager::SidecarManager;
use state::AppState;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

#[tauri::command]
fn toggle_devtools(app: tauri::AppHandle, open: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if open {
            window.open_devtools();
        } else {
            window.close_devtools();
        }
    }
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
                .unwrap_or_else(|_| "openacp_lib=debug".parse().unwrap()),
        )
        .init();

    let sidecar = Arc::new(Mutex::new(SidecarManager::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // Sidecar commands
            core::sidecar::commands::get_server_info,
            core::sidecar::commands::get_workspace_server_info,
            core::sidecar::commands::get_workspace_server_info_from_dir,
            core::sidecar::commands::remove_instance_registration,
            core::sidecar::commands::start_server,
            core::sidecar::commands::stop_server,
            // Onboarding commands
            core::onboarding::commands::check_openacp_installed,
            core::onboarding::commands::check_openacp_config,
            core::onboarding::commands::check_core_update,
            core::onboarding::commands::run_install_script,
            core::onboarding::commands::run_openacp_setup,
            core::onboarding::commands::run_openacp_agents_list,
            core::onboarding::commands::run_openacp_agent_install,
            core::onboarding::commands::dev_reset_openacp,
            // Keychain commands
            core::keychain::commands::keychain_set,
            core::keychain::commands::keychain_get,
            core::keychain::commands::keychain_delete,
            // Filesystem commands
            core::filesystem::commands::path_exists,
            core::filesystem::commands::remove_directory,
            core::filesystem::commands::invoke_cli,
            core::filesystem::commands::get_git_branch,
            core::filesystem::commands::get_git_branches,
            core::filesystem::commands::read_directory,
            core::filesystem::commands::read_file_content,
            core::filesystem::commands::get_workspace_changes,
            toggle_devtools,
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
