use std::path::PathBuf;

/// Returns (binary_path, extra_PATH) — the extra PATH is needed because
/// openacp is a Node.js script (`#!/usr/bin/env node`) and the `node` binary
/// must be in PATH for it to execute. In release builds, PATH is minimal.
pub fn find_openacp_binary() -> Option<(PathBuf, Option<String>)> {
    // 1. Try `which openacp` using the cached shell env PATH. This replaces
    //    the old interactive-shell spam that lived here — the expensive
    //    shell resolution now happens once at startup in shell_env::prewarm.
    if let Some(path) = which_openacp() {
        let extra = bin_dir_for_path(&path);
        return Some((path, extra));
    }

    // 2. Platform-specific known locations (nvm, fnm, homebrew, etc.)
    if let Some(path) = check_known_locations() {
        let extra = bin_dir_for_path(&path);
        return Some((path, extra));
    }

    tracing::warn!("find_openacp_binary: openacp not found anywhere");
    None
}

/// Given the openacp binary path, return its parent dir as extra PATH.
/// This ensures `node` is findable when openacp is a `#!/usr/bin/env node`
/// script (e.g. ~/.nvm/versions/node/v22/bin/openacp).
fn bin_dir_for_path(bin: &PathBuf) -> Option<String> {
    bin.parent().map(|p| p.to_string_lossy().to_string())
}

/// Resolve `openacp` against the cached shell PATH. Runs `which` (Unix) or
/// `where` (Windows) with `shell_env::path()` injected as `PATH` so the
/// subprocess sees the user's full shell PATH even though our parent
/// process may not.
fn which_openacp() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("where")
            .arg("openacp")
            .env("PATH", crate::core::shell_env::path())
            .output()
            .ok()?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                tracing::info!("find_openacp_binary: found via `where`: {trimmed}");
                return Some(PathBuf::from(trimmed));
            }
        }
        None
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = std::process::Command::new("/usr/bin/which")
            .arg("openacp")
            .env("PATH", crate::core::shell_env::path())
            .output()
            .ok()?;
        // Ignore exit code — stdout is authoritative (matches the
        // 4aa7fa3 fix lesson).
        let stdout = String::from_utf8_lossy(&output.stdout);
        let path = stdout.trim().lines().last().unwrap_or("").trim();
        if path.starts_with('/') {
            tracing::info!("find_openacp_binary: found via which: {path}");
            Some(PathBuf::from(path))
        } else {
            None
        }
    }
}

/// Check platform-specific well-known install locations. Still useful as a
/// last-resort fallback when shell env resolution fails entirely.
fn check_known_locations() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    let mut candidates: Vec<PathBuf> = Vec::new();

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            candidates.push(PathBuf::from(&appdata).join("npm").join("openacp.cmd"));
            candidates.push(PathBuf::from(&appdata).join("npm").join("openacp"));
        }
        candidates.push(home.join("scoop/shims/openacp.cmd"));
        candidates.push(home.join("scoop/shims/openacp.exe"));
        if let Ok(nvm_home) = std::env::var("NVM_HOME") {
            let nvm_dir = PathBuf::from(nvm_home);
            if nvm_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                    let mut versions: Vec<_> = entries
                        .flatten()
                        .filter(|e| e.path().is_dir())
                        .map(|e| e.path())
                        .collect();
                    versions.sort_by(|a, b| b.cmp(a));
                    for version_dir in versions {
                        candidates.push(version_dir.join("openacp.cmd"));
                        candidates.push(version_dir.join("openacp"));
                    }
                }
            }
        }
        candidates.push(PathBuf::from(r"C:\ProgramData\chocolatey\bin\openacp.exe"));
        candidates.push(PathBuf::from(r"C:\Program Files\nodejs\openacp.cmd"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        candidates.push(home.join(".npm-global/bin/openacp"));
        candidates.push(home.join(".local/bin/openacp"));
        candidates.push(home.join("bin/openacp"));
        candidates.push(PathBuf::from("/usr/local/bin/openacp"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/openacp"));

        let nvm_dir = home.join(".nvm/versions/node");
        if nvm_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                let mut versions: Vec<_> = entries.flatten().map(|e| e.path()).collect();
                versions.sort_by(|a, b| b.cmp(a));
                for version_dir in versions {
                    candidates.push(version_dir.join("bin/openacp"));
                }
            }
        }

        #[cfg(target_os = "macos")]
        {
            let fnm_dir = home.join("Library/Application Support/fnm/node-versions");
            if fnm_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&fnm_dir) {
                    let mut versions: Vec<_> = entries.flatten().map(|e| e.path()).collect();
                    versions.sort_by(|a, b| b.cmp(a));
                    for version_dir in versions {
                        candidates.push(version_dir.join("installation/bin/openacp"));
                    }
                }
            }
        }

        #[cfg(target_os = "linux")]
        {
            let fnm_dir = home.join(".local/share/fnm/node-versions");
            if fnm_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(&fnm_dir) {
                    let mut versions: Vec<_> = entries.flatten().map(|e| e.path()).collect();
                    versions.sort_by(|a, b| b.cmp(a));
                    for version_dir in versions {
                        candidates.push(version_dir.join("installation/bin/openacp"));
                    }
                }
            }
        }
    }

    tracing::info!(
        "find_openacp_binary: checking {} known locations",
        candidates.len()
    );
    for candidate in &candidates {
        if candidate.exists() {
            tracing::info!("find_openacp_binary: found at {}", candidate.display());
            return Some(candidate.clone());
        }
    }

    tracing::warn!("find_openacp_binary: exhausted all known locations, openacp not found");
    None
}
