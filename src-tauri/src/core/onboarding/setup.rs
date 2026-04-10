use crate::core::sidecar::binary::{find_openacp_binary, prepend_path};
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

/// Build a tokio Command for openacp with the right PATH set.
/// openacp is a Node.js script (`#!/usr/bin/env node`), so we must ensure
/// `node` is in PATH -- which it won't be in release builds.
pub fn openacp_command() -> Result<(tokio::process::Command, std::path::PathBuf), String> {
    let (bin, extra_path) = find_openacp_binary()
        .ok_or_else(|| "openacp not found — please install it first".to_string())?;
    let mut cmd = tokio::process::Command::new(&bin);
    if let Some(ref extra) = extra_path {
        cmd.env("PATH", prepend_path(extra));
    }
    Ok((cmd, bin))
}

/// Runs `openacp --version` and returns the version string, or None if not installed.
pub async fn check_installed() -> Result<Option<String>, String> {
    let (mut cmd, bin) = match openacp_command() {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("check_openacp_installed: binary not found — {e}");
            return Ok(None);
        }
    };

    tracing::info!("check_openacp_installed: found binary at {}, running --version", bin.display());

    let result = cmd.args(["--version"]).output().await;

    match result {
        Err(e) => {
            tracing::warn!("check_openacp_installed: failed to spawn --version: {e}");
            Ok(None)
        }
        Ok(output) if !output.status.success() => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            tracing::warn!(
                "check_openacp_installed: --version exited with {:?}\n  stdout: {stdout}\n  stderr: {stderr}",
                output.status.code()
            );
            Ok(None)
        }
        Ok(output) => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            tracing::info!("check_openacp_installed: installed, version={version}");
            Ok(Some(version))
        }
    }
}

/// Returns true if at least one OpenACP instance is registered.
/// Checks ~/.openacp/instances.json (shared registry) for entries.
pub fn check_config() -> Result<bool, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let instances_path = home.join(".openacp").join("instances.json");
    if !instances_path.exists() {
        return Ok(false);
    }
    // Parse instances.json and check if any instance exists
    let content = std::fs::read_to_string(&instances_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    let instances = json.get("instances").and_then(|v| v.as_object());
    Ok(instances.map_or(false, |m| !m.is_empty()))
}

/// Calls the npm registry to check if a newer @openacp/cli version is available.
/// Returns None if already up to date or check fails (network error, etc.).
#[derive(Clone, serde::Serialize)]
pub struct CoreUpdateInfo {
    pub current: String,
    pub latest: String,
}

pub async fn check_update() -> Result<Option<CoreUpdateInfo>, String> {
    // Get current version
    let (mut cmd, _bin) = openacp_command()?;
    let output = cmd
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

/// Runs `openacp setup --dir <workspace> --agent <agent>
///   --run-mode daemon --json` and streams output via "setup-output" event.
/// Returns the JSON result string from the CLI on success.
pub async fn run_setup(
    app: &tauri::AppHandle,
    workspace: &str,
    agent: &str,
) -> Result<String, String> {
    let (bin, extra_path) = find_openacp_binary()
        .ok_or("openacp not found — please install it first")?;
    let mut shell_cmd = app.shell().command(bin.to_string_lossy().to_string());
    if let Some(ref extra) = extra_path {
        shell_cmd = shell_cmd.env("PATH", prepend_path(extra));
    }
    let (mut rx, _child) = shell_cmd
        .args([
            "setup",
            "--dir",
            workspace,
            "--agent",
            agent,
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
pub async fn agents_list(workspace_dir: Option<String>) -> Result<String, String> {
    tracing::info!("run_openacp_agents_list: running `openacp agents list --json`");

    let (mut cmd, _bin) = openacp_command()?;
    if let Some(ref dir) = workspace_dir {
        cmd.args(["--dir", dir]);
    }
    let output = cmd.args(["agents", "list", "--json"])
        .output()
        .await
        .map_err(|e| {
            tracing::error!("run_openacp_agents_list: failed to spawn command: {e}");
            e.to_string()
        })?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        tracing::info!(
            "run_openacp_agents_list: success, stdout len={}",
            stdout.len()
        );
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
pub async fn agent_install(app: &tauri::AppHandle, agent_key: &str, workspace_dir: Option<&str>) -> Result<(), String> {
    let (bin, extra_path) = find_openacp_binary()
        .ok_or("openacp not found — please install it first")?;
    let mut shell_cmd = app.shell().command(bin.to_string_lossy().to_string());
    if let Some(ref extra) = extra_path {
        shell_cmd = shell_cmd.env("PATH", prepend_path(extra));
    }
    if let Some(dir) = workspace_dir {
        shell_cmd = shell_cmd.args(["--dir", dir]);
    }
    let (mut rx, _child) = shell_cmd
        .args(["agents", "install", agent_key])
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
pub async fn dev_reset(app: &tauri::AppHandle) -> Result<(), String> {
    // Remove ~/.openacp
    if let Some(home) = dirs::home_dir() {
        let openacp_dir = home.join(".openacp");
        if openacp_dir.exists() {
            std::fs::remove_dir_all(&openacp_dir).map_err(|e| e.to_string())?;
        }
    }

    // Remove openacp binary using same discovery as the rest of the app
    if let Some((bin, _)) = find_openacp_binary() {
        std::fs::remove_file(&bin).ok(); // best-effort
        tracing::info!("dev_reset: removed binary at {}", bin.display());
    }

    Ok(())
}
