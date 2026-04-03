use tauri::Emitter;
use tauri_plugin_shell::ShellExt;

/// Runs `openacp --version` and returns the version string, or None if not installed.
/// Returns Ok(None) both when the binary doesn't exist and when it exits non-zero.
#[tauri::command]
pub async fn check_openacp_installed(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let result = app
        .shell()
        .command("openacp")
        .args(["--version"])
        .output()
        .await;

    match result {
        Err(_) => Ok(None),
        Ok(output) if !output.status.success() => Ok(None),
        Ok(output) => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(Some(version))
        }
    }
}

/// Returns true if ~/.openacp/config.json exists.
#[tauri::command]
pub async fn check_openacp_config() -> Result<bool, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let config_path = home.join(".openacp").join("config.json");
    Ok(config_path.exists())
}

/// Calls the npm registry to check if a newer @openacp/cli version is available.
/// Returns None if already up to date or check fails (network error, etc.).
#[derive(Clone, serde::Serialize)]
pub struct CoreUpdateInfo {
    pub current: String,
    pub latest: String,
}

#[tauri::command]
pub async fn check_core_update(app: tauri::AppHandle) -> Result<Option<CoreUpdateInfo>, String> {
    // Get current version
    let output = app
        .shell()
        .command("openacp")
        .args(["--version"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(None);
    }

    let current = String::from_utf8_lossy(&output.stdout)
        .trim()
        .trim_start_matches("openacp v")
        .to_string();

    // Check npm registry (5s timeout)
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get("https://registry.npmjs.org/@openacp/cli/latest")
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(_) => return Ok(None), // silent fail on network error
    };

    let json: serde_json::Value = match resp.json().await {
        Ok(j) => j,
        Err(_) => return Ok(None),
    };

    let latest = json["version"].as_str().unwrap_or("").to_string();

    if latest.is_empty() || latest == current {
        return Ok(None);
    }

    Ok(Some(CoreUpdateInfo { current, latest }))
}

/// Runs the openacp install script for the current OS.
/// Streams stdout/stderr line-by-line via the "install-output" Tauri event.
/// Returns Ok(()) on success, Err(message) on non-zero exit.
#[tauri::command]
pub async fn run_install_script(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::process::CommandEvent;

    let os = std::env::consts::OS;

    let (mut rx, _child) = match os {
        "macos" | "linux" => app
            .shell()
            .command("bash")
            .args([
                "-c",
                "curl -fsSL https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.sh | bash -s -- --no-onboard --no-prompt",
            ])
            .spawn()
            .map_err(|e| e.to_string())?,
        "windows" => app
            .shell()
            .command("powershell")
            .args([
                "-Command",
                "& { $s = irm https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.ps1; $sb = [scriptblock]::Create($s); & $sb -NoOnboard }",
            ])
            .spawn()
            .map_err(|e| e.to_string())?,
        other => return Err(format!("Unsupported OS: {other}")),
    };

    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit("install-output", line);
            }
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit("install-output", line);
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            _ => {}
        }
    }

    match exit_code {
        Some(0) | None => Ok(()),
        Some(code) => Err(format!("Install script exited with code {code}")),
    }
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
    use tauri_plugin_shell::process::CommandEvent;

    let (mut rx, _child) = app
        .shell()
        .command("openacp")
        .args([
            "setup",
            "--global",
            "--workspace",
            &workspace,
            "--agent",
            &agent,
            "--run-mode",
            "daemon",
            "--json",
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut json_result = String::new();
    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                json_result.push_str(&line);
                let _ = app.emit("setup-output", line);
            }
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit("setup-output", line);
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            _ => {}
        }
    }

    match exit_code {
        Some(0) | None => Ok(json_result),
        Some(code) => {
            // Extract human-readable message from the JSON error envelope if available
            let message = serde_json::from_str::<serde_json::Value>(&json_result)
                .ok()
                .and_then(|v| v["error"]["message"].as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| format!("openacp setup exited with code {code}"));
            Err(message)
        }
    }
}

/// Runs `openacp agents list --json` and returns the raw JSON string.
#[allow(dead_code)]
#[tauri::command]
pub async fn run_openacp_agents_list(app: tauri::AppHandle) -> Result<String, String> {
    tracing::info!("run_openacp_agents_list: running `openacp agents list --json`");

    let output = app
        .shell()
        .command("openacp")
        .args(["agents", "list", "--json"])
        .output()
        .await
        .map_err(|e| {
            tracing::error!("run_openacp_agents_list: failed to spawn command: {e}");
            e.to_string()
        })?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        tracing::info!("run_openacp_agents_list: success, stdout len={}", stdout.len());
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        tracing::error!(
            "run_openacp_agents_list: command failed\n  exit={:?}\n  stderr={stderr}\n  stdout={stdout}",
            output.status.code()
        );
        Err(stderr)
    }
}

/// Runs `openacp agents install <agent_key>`, streaming output via "agent-install-output".
#[tauri::command]
pub async fn run_openacp_agent_install(
    app: tauri::AppHandle,
    agent_key: String,
) -> Result<(), String> {
    use tauri_plugin_shell::process::CommandEvent;

    let (mut rx, _child) = app
        .shell()
        .command("openacp")
        .args(["agents", "install", &agent_key])
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit("agent-install-output", line);
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            _ => {}
        }
    }

    match exit_code {
        Some(0) | None => Ok(()),
        Some(code) => Err(format!("Agent install exited with code {code}")),
    }
}

/// Dev-only: removes ~/.openacp config dir and the openacp binary.
/// Used to reset onboarding state during development.
#[allow(dead_code)]
#[tauri::command]
pub async fn dev_reset_openacp(app: tauri::AppHandle) -> Result<(), String> {
    // Remove ~/.openacp
    if let Some(home) = dirs::home_dir() {
        let openacp_dir = home.join(".openacp");
        if openacp_dir.exists() {
            std::fs::remove_dir_all(&openacp_dir).map_err(|e| e.to_string())?;
        }
    }

    // Remove openacp binary via `which openacp`
    let which = app
        .shell()
        .command("which")
        .args(["openacp"])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if which.status.success() {
        let bin_path = String::from_utf8_lossy(&which.stdout).trim().to_string();
        if !bin_path.is_empty() {
            std::fs::remove_file(&bin_path).ok(); // best-effort
        }
    }

    Ok(())
}
