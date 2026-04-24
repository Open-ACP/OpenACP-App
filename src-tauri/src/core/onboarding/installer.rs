use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

/// Runs the openacp install script for the current OS.
/// Streams stdout/stderr line-by-line via the "install-output" Tauri event.
/// Returns Ok(()) on success, Err(message) on non-zero exit.
pub async fn run_install(app: &tauri::AppHandle) -> Result<(), String> {
    let os = std::env::consts::OS;

    let (mut rx, _child) = match os {
        "macos" | "linux" => {
            // Use the user's interactive shell (-i) so that shell rc files (e.g. ~/.zshrc,
            // ~/.bashrc) are sourced. This ensures PATH-based tools like nvm, fnm are
            // available — login shell (-l) only loads .zprofile which often misses nvm init.
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
            app.shell()
                .command(&shell)
                .args([
                    "-i",
                    "-c",
                    "curl -fsSL https://raw.githubusercontent.com/Open-ACP/OpenACP/main/scripts/install.sh | bash -s -- --no-onboard --no-prompt",
                ])
                .spawn()
                .map_err(|e| e.to_string())?
        }
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
