use std::path::PathBuf;

/// Returns (binary_path, extra_PATH) -- the extra PATH is needed because
/// openacp is a Node.js script (`#!/usr/bin/env node`) and the `node` binary
/// must be in PATH for it to execute. In release builds, PATH is minimal.
pub fn find_openacp_binary() -> Option<(PathBuf, Option<String>)> {
    // 1. Try resolving via system shell (handles PATH properly on each OS)
    if let Some(path) = resolve_via_shell() {
        let extra = bin_dir_for_path(&path);
        return Some((path, extra));
    }

    // 2. Check common install locations per platform
    if let Some(path) = check_known_locations() {
        let extra = bin_dir_for_path(&path);
        return Some((path, extra));
    }

    tracing::warn!("find_openacp_binary: openacp not found anywhere");
    None
}

/// Given the openacp binary path, return its parent dir as extra PATH.
/// This ensures `node` is findable when openacp is a `#!/usr/bin/env node` script
/// (e.g. ~/.nvm/versions/node/v22/bin/openacp -> add ~/.nvm/versions/node/v22/bin to PATH).
fn bin_dir_for_path(bin: &PathBuf) -> Option<String> {
    bin.parent().map(|p| p.to_string_lossy().to_string())
}

/// Use the system shell to resolve the binary from the user's full PATH.
/// On macOS/Linux: login shell loads ~/.zshrc, ~/.bashrc etc.
/// On Windows: `where` command searches PATH + App Paths registry.
fn resolve_via_shell() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        // `where openacp` searches PATH and App Paths
        if let Ok(output) = std::process::Command::new("where")
            .arg("openacp")
            .output()
        {
            if output.status.success() {
                // `where` may return multiple lines, take the first
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = stdout.lines().next() {
                    let path = first.trim().to_string();
                    if !path.is_empty() {
                        tracing::debug!("find_openacp_binary: found via `where`: {path}");
                        return Some(PathBuf::from(path));
                    }
                }
            }
        }
        // Also try cmd.exe /C which is how GUI apps can resolve PATH
        if let Ok(output) = std::process::Command::new("cmd")
            .args(["/C", "where", "openacp"])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = stdout.lines().next() {
                    let path = first.trim().to_string();
                    if !path.is_empty() {
                        tracing::debug!("find_openacp_binary: found via cmd /C where: {path}");
                        return Some(PathBuf::from(path));
                    }
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Try zsh first (macOS default), then bash
        for shell in ["zsh", "bash"] {
            if let Ok(output) = std::process::Command::new(shell)
                .args(["-l", "-c", "which openacp"])
                .output()
            {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        tracing::debug!("find_openacp_binary: found via {shell} login: {path}");
                        return Some(PathBuf::from(path));
                    }
                }
            }
        }
    }

    None
}

/// Check platform-specific well-known install locations.
fn check_known_locations() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // npm global (default on Windows)
        if let Ok(appdata) = std::env::var("APPDATA") {
            candidates.push(PathBuf::from(&appdata).join("npm").join("openacp.cmd"));
            candidates.push(PathBuf::from(&appdata).join("npm").join("openacp"));
        }
        // Scoop
        candidates.push(home.join("scoop/shims/openacp.cmd"));
        candidates.push(home.join("scoop/shims/openacp.exe"));
        // nvm-windows
        if let Ok(nvm_home) = std::env::var("NVM_HOME") {
            let nvm_dir = PathBuf::from(nvm_home);
            if nvm_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                    for entry in entries.flatten() {
                        if entry.path().is_dir() {
                            candidates.push(entry.path().join("openacp.cmd"));
                            candidates.push(entry.path().join("openacp"));
                        }
                    }
                }
            }
        }
        // Chocolatey
        candidates.push(PathBuf::from(r"C:\ProgramData\chocolatey\bin\openacp.exe"));
        // Program Files
        candidates.push(PathBuf::from(r"C:\Program Files\nodejs\openacp.cmd"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Common Unix locations
        candidates.push(home.join(".npm-global/bin/openacp"));
        candidates.push(home.join(".local/bin/openacp"));
        candidates.push(home.join("bin/openacp"));
        candidates.push(PathBuf::from("/usr/local/bin/openacp"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/openacp"));

        // nvm
        let nvm_dir = home.join(".nvm/versions/node");
        if nvm_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("bin/openacp"));
                }
            }
        }

        // fnm (macOS)
        #[cfg(target_os = "macos")]
        {
            let fnm_dir = home.join("Library/Application Support/fnm/node-versions");
            if fnm_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&fnm_dir) {
                    for entry in entries.flatten() {
                        candidates.push(entry.path().join("installation/bin/openacp"));
                    }
                }
            }
        }

        // fnm (Linux)
        #[cfg(target_os = "linux")]
        {
            let fnm_dir = home.join(".local/share/fnm/node-versions");
            if fnm_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&fnm_dir) {
                    for entry in entries.flatten() {
                        candidates.push(entry.path().join("installation/bin/openacp"));
                    }
                }
            }
        }
    }

    for candidate in &candidates {
        if candidate.exists() {
            tracing::debug!("find_openacp_binary: found at {}", candidate.display());
            return Some(candidate.clone());
        }
    }

    None
}

/// Helper: build PATH string with extra dir prepended (platform-aware separator).
pub fn prepend_path(extra: &str) -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let sep = if cfg!(windows) { ";" } else { ":" };
    format!("{extra}{sep}{current}")
}
