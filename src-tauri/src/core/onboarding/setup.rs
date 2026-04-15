use crate::core::sidecar::binary::{find_openacp_binary, resolve_openacp_launcher};
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

/// Build a complete PATH string for running openacp and its subprocesses.
/// Thin wrapper over shell_env::path() — prepends openacp bin dir and
/// co-located node dir (if any) to the cached shell PATH, then dedupes.
///
/// This replaces the old version that spawned interactive shells to find
/// node. Shell resolution now happens exactly once in shell_env::prewarm.
pub fn build_openacp_path(bin: &std::path::Path, extra_path: &Option<String>) -> String {
    let base = crate::core::shell_env::path();
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut parts: Vec<String> = Vec::new();

    // 1. openacp binary dir (so `openacp` itself and any sibling tools resolve)
    if let Some(extra) = extra_path {
        parts.push(extra.clone());
    }

    // 2. Co-located node dir (e.g. ~/.nvm/versions/node/v22/bin/node sits
    //    right next to openacp in that dir). Well-known dirs from
    //    shell_env already cover /usr/local/bin and /opt/homebrew/bin.
    let openacp_dir = bin.parent().unwrap_or(std::path::Path::new(""));
    let co_located_node = openacp_dir.join("node");
    if co_located_node.exists() {
        parts.push(openacp_dir.to_string_lossy().to_string());
    }

    parts.push(base.to_string());
    crate::core::shell_env::dedupe_path(&parts.join(sep), sep)
}

/// Build a tokio Command for openacp with the right env set.
///
/// Prefers the explicit-node launcher (`node cli.js …`) for determinism —
/// this guarantees that regardless of user PATH state, openacp always runs
/// under the node that owns its npm prefix. Falls back to spawning the shim
/// directly if the launcher can't be resolved (non-node script, node
/// binary missing, etc.).
///
/// Returns `(cmd, shim)` — `shim` is the user-visible binary path for
/// logging and dev_reset.
pub fn openacp_command() -> Result<(tokio::process::Command, std::path::PathBuf), String> {
    if let Some(launcher) = resolve_openacp_launcher() {
        let mut cmd = tokio::process::Command::new(&launcher.node);
        cmd.arg(&launcher.entry);
        // Use the matching node's dir as the PATH prefix so any subprocess
        // openacp spawns (e.g. `npm install` for agents) resolves node via
        // the same install prefix — otherwise we're back to the multi-node
        // hazard this function exists to eliminate.
        let node_dir = launcher
            .node
            .parent()
            .map(|p| p.to_string_lossy().to_string());
        let path_override = build_openacp_path(&launcher.shim, &node_dir);
        let env = crate::core::shell_env::clean_env(Some(&path_override));
        cmd.env_clear();
        cmd.envs(env);
        return Ok((cmd, launcher.shim));
    }

    // Fallback: spawn the shim directly. clean_env still strips DENYLIST
    // and ensures node is findable via shell_env PATH.
    let (bin, extra_path) = find_openacp_binary()
        .ok_or_else(|| "openacp not found — please install it first".to_string())?;
    let mut cmd = tokio::process::Command::new(&bin);
    let path_override = build_openacp_path(&bin, &extra_path);
    let env = crate::core::shell_env::clean_env(Some(&path_override));
    cmd.env_clear();
    cmd.envs(env);
    Ok((cmd, bin))
}

/// Build a tauri_plugin_shell Command for openacp (the streaming flavor
/// used for `setup` and `agents install`). Same launcher-or-fallback
/// semantics as `openacp_command`. Caller appends subcommand args.
pub fn build_openacp_shell_command(
    app: &tauri::AppHandle,
) -> Result<(tauri_plugin_shell::process::Command, std::path::PathBuf), String> {
    if let Some(launcher) = resolve_openacp_launcher() {
        let node_dir = launcher
            .node
            .parent()
            .map(|p| p.to_string_lossy().to_string());
        let path_override = build_openacp_path(&launcher.shim, &node_dir);
        let env = crate::core::shell_env::clean_env(Some(&path_override));
        let mut cmd = app
            .shell()
            .command(launcher.node.to_string_lossy().to_string());
        cmd = cmd.arg(launcher.entry.to_string_lossy().to_string());
        cmd = cmd.envs(env);
        return Ok((cmd, launcher.shim));
    }

    let (bin, extra_path) = find_openacp_binary()
        .ok_or("openacp not found — please install it first".to_string())?;
    let path_override = build_openacp_path(&bin, &extra_path);
    let env = crate::core::shell_env::clean_env(Some(&path_override));
    let mut cmd = app.shell().command(bin.to_string_lossy().to_string());
    cmd = cmd.envs(env);
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
    let (mut shell_cmd, _shim) = build_openacp_shell_command(app)?;
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
/// When no workspace_dir is given, uses a fallback dir to satisfy the CLI's
/// non-interactive mode requirement (agents list is a global command but
/// some CLI versions require --dir in non-interactive/piped contexts).
pub async fn agents_list(workspace_dir: Option<String>) -> Result<String, String> {
    tracing::info!("run_openacp_agents_list: running `openacp agents list --json`");

    let (mut cmd, _bin) = openacp_command()?;
    let fallback_dir = workspace_dir.or_else(|| {
        dirs::home_dir().map(|h| h.to_string_lossy().to_string())
    });
    if let Some(ref dir) = fallback_dir {
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
///
/// Uses `--dir` with a home-dir fallback if no workspace is provided, matching
/// the pattern in `agents_list`. Some CLI versions/environments require
/// `--dir` in non-interactive mode (piped stdout from Tauri) even for global
/// commands. Missing this was the likely cause of the "exit 1" bug reported
/// by multiple users during onboarding.
///
/// Also writes full stdout/stderr + diagnostic context to the desktop log
/// file on failure, so future bug reports include the actual CLI error
/// without needing to reproduce locally.
pub async fn agent_install(app: &tauri::AppHandle, agent_key: &str, workspace_dir: Option<&str>) -> Result<(), String> {
    let (mut shell_cmd, shim) = build_openacp_shell_command(app)?;

    // Same fallback as agents_list — pass --dir even if caller didn't,
    // using home dir as the non-interactive-mode hint. Without this, the
    // CLI errors out with "No OpenACP instances found. Run `openacp` in
    // your workspace directory to set up." because it can't determine a
    // workspace context from piped stdout. Confirmed by temporarily
    // disabling this fallback and reproducing exit 1.
    let fallback_dir = workspace_dir
        .map(|s| s.to_string())
        .or_else(|| dirs::home_dir().map(|h| h.to_string_lossy().to_string()));

    tracing::info!(
        "agent_install: shim={} --dir={:?} agent={}",
        shim.display(),
        fallback_dir.as_deref().unwrap_or("<none>"),
        agent_key
    );

    if let Some(ref dir) = fallback_dir {
        shell_cmd = shell_cmd.args(["--dir", dir]);
    }
    let (mut rx, _child) = shell_cmd
        .args(["agents", "install", "--force", agent_key])
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut exit_code: Option<i32> = None;
    let mut output_lines: Vec<String> = Vec::new();

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).to_string();
                output_lines.push(line.clone());
                let _ = app.emit("agent-install-output", line);
            }
            CommandEvent::Terminated(payload) => {
                exit_code = payload.code;
                break;
            }
            _ => {}
        }
    }

    let combined = output_lines.join("\n");
    match exit_code {
        Some(0) | None => Ok(()),
        Some(code) => {
            // Full output to file logger — short prefix to tracing.
            let head = &combined[..combined.len().min(300)];
            tracing::error!("agent_install: exited with code {code}, output: {head}");
            crate::core::logging::write_line(
                "ERROR",
                "be",
                &format!(
                    "agent_install {agent_key} exited code={code} --dir={dir:?}\n----\n{combined}\n----",
                    dir = fallback_dir.as_deref().unwrap_or("<none>")
                ),
            );
            Err(format!("Agent install exited with code {code}"))
        }
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
