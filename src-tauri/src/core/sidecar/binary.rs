use std::path::{Path, PathBuf};

/// Full resolution for spawning `openacp`. Distinguishes the shim (what
/// PATH points to, good for logging / uninstall) from the real CLI entry
/// and the node binary that owns the node_modules containing it.
///
/// The key insight for multi-node users (brew + nvm + manual install):
/// the `openacp` shim uses `#!/usr/bin/env node`, so at runtime `env node`
/// picks WHATEVER comes first in PATH — which may be a different node than
/// the one that installed openacp. npm global state is per-node-prefix, so
/// installing/checking agents from the "wrong" node sees stale state and
/// the CLI errors out with "already installed" (exit 1).
///
/// By resolving the shim's symlinks and walking up to find the owning
/// `<prefix>/bin/node`, we can invoke openacp as `<that node> <cli.js> …`
/// — bypassing the shebang entirely and guaranteeing the same node runs
/// the CLI every time, regardless of PATH state.
#[derive(Debug, Clone)]
pub struct OpenAcpLauncher {
    /// The shim binary that PATH points to. Still used for logging and
    /// `dev_reset` (which wants to delete the user-visible entry point).
    pub shim: PathBuf,
    /// The real CLI entry point (`.js` file) after resolving symlinks.
    pub entry: PathBuf,
    /// The node binary that owns the node_modules containing `entry`.
    pub node: PathBuf,
}

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

/// Try to resolve a full launcher (explicit node + CLI entry) for openacp.
///
/// Returns `None` if:
/// - The shim isn't found
/// - The shim's canonical target isn't a Node script (e.g. native binary,
///   shell wrapper that doesn't shebang to node)
/// - No matching node can be found by walking up from the entry
///
/// Callers should fall back to spawning the shim directly when this returns
/// `None` — that path still works for the simple case (single node install).
pub fn resolve_openacp_launcher() -> Option<OpenAcpLauncher> {
    let (shim, _) = find_openacp_binary()?;
    // Follow symlinks to find the real entry. For npm-installed global CLIs
    // this resolves `<prefix>/bin/openacp` -> `<prefix>/lib/node_modules/…/cli.js`.
    let entry = match std::fs::canonicalize(&shim) {
        Ok(p) => p,
        Err(e) => {
            tracing::debug!(
                "resolve_openacp_launcher: canonicalize({}) failed: {e}",
                shim.display()
            );
            return None;
        }
    };
    if !is_node_script(&entry) {
        tracing::debug!(
            "resolve_openacp_launcher: {} is not a node script, falling back to shim",
            entry.display()
        );
        return None;
    }
    let node = find_matching_node(&entry)?;
    tracing::info!(
        "resolve_openacp_launcher: shim={} entry={} node={}",
        shim.display(),
        entry.display(),
        node.display()
    );
    Some(OpenAcpLauncher { shim, entry, node })
}

/// Read the first 128 bytes of a file and check if it starts with a Node
/// shebang. Covers `#!/usr/bin/env node`, `#!/usr/bin/env -S node`,
/// `#!/opt/homebrew/bin/node`, `#!/home/user/.nvm/.../node`, etc.
///
/// Returns `false` on any I/O error, non-UTF8 bytes, or missing shebang.
fn is_node_script(path: &Path) -> bool {
    use std::io::Read;
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let mut buf = [0u8; 128];
    let n = match file.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return false,
    };
    let head = match std::str::from_utf8(&buf[..n]) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let first_line = head.lines().next().unwrap_or("");
    first_line.starts_with("#!") && first_line.contains("node")
}

/// Walk up from a canonical CLI entry path looking for a `<dir>/bin/node`
/// that exists. Returns the first match.
///
/// For npm-installed globals the entry is at
/// `<prefix>/lib/node_modules/<pkg>/<bin>`, and the matching node is at
/// `<prefix>/bin/node`. Walking up from `<bin>` eventually hits `<prefix>`
/// which contains `bin/node`. We cap the walk at 10 levels so we never
/// search beyond the filesystem root.
fn find_matching_node(cli_entry: &Path) -> Option<PathBuf> {
    let mut current = cli_entry.parent()?;
    for _ in 0..10 {
        let candidate = current.join("bin").join("node");
        if candidate.is_file() {
            return Some(candidate);
        }
        current = match current.parent() {
            Some(p) => p,
            None => return None,
        };
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn is_node_script_detects_env_node_shebang() {
        let dir = tempdir();
        let path = dir.join("cli.js");
        std::fs::write(&path, b"#!/usr/bin/env node\nconsole.log('hi')\n").unwrap();
        assert!(is_node_script(&path));
    }

    #[test]
    fn is_node_script_detects_absolute_node_shebang() {
        let dir = tempdir();
        let path = dir.join("cli.js");
        std::fs::write(&path, b"#!/opt/homebrew/bin/node\n// body\n").unwrap();
        assert!(is_node_script(&path));
    }

    #[test]
    fn is_node_script_rejects_non_node_shebang() {
        let dir = tempdir();
        let path = dir.join("cli.sh");
        std::fs::write(&path, b"#!/bin/bash\necho hi\n").unwrap();
        assert!(!is_node_script(&path));
    }

    #[test]
    fn is_node_script_rejects_file_without_shebang() {
        let dir = tempdir();
        let path = dir.join("cli.js");
        std::fs::write(&path, b"console.log('hi')\n").unwrap();
        assert!(!is_node_script(&path));
    }

    #[test]
    fn is_node_script_rejects_missing_file() {
        assert!(!is_node_script(Path::new("/nonexistent/path/cli.js")));
    }

    #[test]
    fn find_matching_node_finds_prefix_bin_node() {
        // Simulate: <tmp>/prefix/lib/node_modules/@openacp/cli/dist/cli.js
        //           <tmp>/prefix/bin/node
        let dir = tempdir();
        let prefix = dir.join("prefix");
        let entry_parent = prefix.join("lib/node_modules/@openacp/cli/dist");
        std::fs::create_dir_all(&entry_parent).unwrap();
        let entry = entry_parent.join("cli.js");
        std::fs::write(&entry, b"#!/usr/bin/env node\n").unwrap();

        let bin_dir = prefix.join("bin");
        std::fs::create_dir_all(&bin_dir).unwrap();
        let node_path = bin_dir.join("node");
        std::fs::write(&node_path, b"").unwrap();

        let found = find_matching_node(&entry).unwrap();
        assert_eq!(found, node_path);
    }

    #[test]
    fn find_matching_node_returns_none_when_no_node_nearby() {
        let dir = tempdir();
        let entry_parent = dir.join("some/deep/path");
        std::fs::create_dir_all(&entry_parent).unwrap();
        let entry = entry_parent.join("cli.js");
        std::fs::write(&entry, b"#!/usr/bin/env node\n").unwrap();
        // No bin/node anywhere under dir → None
        assert!(find_matching_node(&entry).is_none());
    }

    #[test]
    fn find_matching_node_picks_closest_when_multiple() {
        // Both <tmp>/outer/bin/node and <tmp>/outer/prefix/bin/node exist.
        // Entry is under prefix → should find prefix/bin/node first.
        let dir = tempdir();
        let outer_bin = dir.join("outer/bin");
        std::fs::create_dir_all(&outer_bin).unwrap();
        std::fs::write(outer_bin.join("node"), b"").unwrap();

        let prefix_bin = dir.join("outer/prefix/bin");
        std::fs::create_dir_all(&prefix_bin).unwrap();
        let prefix_node = prefix_bin.join("node");
        std::fs::write(&prefix_node, b"").unwrap();

        let entry_parent = dir.join("outer/prefix/lib/node_modules/@openacp/cli/dist");
        std::fs::create_dir_all(&entry_parent).unwrap();
        let entry = entry_parent.join("cli.js");
        std::fs::write(&entry, b"#!/usr/bin/env node\n").unwrap();

        let found = find_matching_node(&entry).unwrap();
        assert_eq!(found, prefix_node);
    }

    fn tempdir() -> PathBuf {
        let base = std::env::temp_dir().join(format!(
            "openacp-binary-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        // Defensive: remove if it somehow exists
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        base
    }

    #[allow(dead_code)]
    fn write_all(path: &Path, bytes: &[u8]) {
        let mut f = std::fs::File::create(path).unwrap();
        f.write_all(bytes).unwrap();
    }
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
