//! Resolves the user's shell environment exactly once per app lifetime and
//! caches it in a `OnceLock<ShellEnv>`. Every spawn site in the app reads
//! from this cache instead of spawning a shell itself.
//!
//! See `docs/superpowers/specs/2026-04-15-unified-shell-env-design.md`.

#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

/// Env vars that must NEVER be inherited by the openacp CLI child process,
/// regardless of what's in the user's shell. Each is an injection vector or
/// footgun for a Node.js CLI specifically.
const DENYLIST: &[&str] = &[
    // Node injection — openacp is a Node CLI
    "NODE_OPTIONS",        // can --require arbitrary scripts
    "NODE_PATH",           // can hijack module resolution
    // Shell injection — bash/sh -c sources these before running commands
    "BASH_ENV",
    "ENV",
    // npm prefix — if set weirdly, `openacp agents install` writes to the
    // wrong place. Explicit is safer.
    "npm_config_prefix",
    "NPM_CONFIG_PREFIX",
];

/// Platform-specific well-known directories where `node` may live. Merged
/// into the cached PATH so the `#!/usr/bin/env node` shebang always resolves.
#[cfg(not(windows))]
const WELL_KNOWN_NODE_DIRS: &[&str] = &[
    "/usr/local/bin",
    "/opt/homebrew/bin",
];

/// How long to wait for the shell to produce env output before giving up
/// and falling back to `std::env`.
const TIMEOUT: Duration = Duration::from_secs(5);

/// A resolved snapshot of the user's shell environment.
#[derive(Debug, Clone)]
pub struct ShellEnv {
    /// Full env as captured from the shell, with DENYLIST entries removed.
    pub vars: HashMap<String, String>,
    /// Pre-deduped PATH with well-known node dirs merged in. This is what
    /// callers set on spawned `Command::env("PATH", ...)`.
    pub path: String,
    /// Which shell resolved the env, for diagnostics. `None` on Windows or
    /// on fallback.
    pub resolved_via: Option<String>,
}

static SNAPSHOT: OnceLock<ShellEnv> = OnceLock::new();

// ─── Public API ─────────────────────────────────────────────────────────

/// Resolves the shell env and caches it. Idempotent — subsequent calls are
/// no-ops. Intended to be called from a dedicated OS thread at startup so
/// a slow `.zshrc` never blocks the async runtime.
pub fn prewarm() {
    let _ = SNAPSHOT.get_or_init(resolve_blocking);
}

/// Returns the cached snapshot. If prewarm hasn't finished, performs the
/// resolve synchronously (bounded by TIMEOUT). Never blocks indefinitely,
/// never errors — always returns a usable `ShellEnv` (falling back to
/// `std::env` on any failure).
pub fn snapshot() -> &'static ShellEnv {
    SNAPSHOT.get_or_init(resolve_blocking)
}

/// Convenience: just the cached PATH string.
pub fn path() -> &'static str {
    &snapshot().path
}

/// Returns a clean env `HashMap` suitable for spawning `openacp` and its
/// children. Starts from the DENYLIST-stripped snapshot vars, overrides PATH
/// with an optional prefix prepended, and returns the result.
pub fn clean_env(extra_path_prefix: Option<&str>) -> HashMap<String, String> {
    clean_env_from(snapshot(), extra_path_prefix)
}

/// Dedupe PATH entries while preserving order of first occurrence.
pub fn dedupe_path(path: &str, sep: &str) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut kept: Vec<&str> = Vec::new();
    for part in path.split(sep) {
        if part.is_empty() {
            continue;
        }
        if seen.insert(part) {
            kept.push(part);
        }
    }
    kept.join(sep)
}

// ─── Internals (implemented in later tasks) ─────────────────────────────

/// Parses a NUL-delimited env buffer (output of `env -0`) into a HashMap.
/// Skips entries that lack `=`, entries with invalid UTF-8, and empty
/// segments. Returns `None` only if the entire input is empty.
fn parse_env_nul(bytes: &[u8]) -> Option<HashMap<String, String>> {
    if bytes.is_empty() {
        return None;
    }
    let mut map = HashMap::new();
    for entry in bytes.split(|&b| b == 0) {
        if entry.is_empty() {
            continue;
        }
        let eq_pos = match entry.iter().position(|&b| b == b'=') {
            Some(p) => p,
            None => continue, // no '=', skip
        };
        let key = match std::str::from_utf8(&entry[..eq_pos]) {
            Ok(k) => k.to_string(),
            Err(_) => continue,
        };
        let value = match std::str::from_utf8(&entry[eq_pos + 1..]) {
            Ok(v) => v.to_string(),
            Err(_) => continue,
        };
        map.insert(key, value);
    }
    Some(map)
}

/// Given shell stdout containing `MARK...env -0 output...MARK`, extract the
/// bytes between the two marks and parse them. Returns `None` if both marks
/// aren't present.
fn extract_marked_env(stdout: &[u8], marker: &str) -> Option<HashMap<String, String>> {
    let marker_bytes = marker.as_bytes();
    let start = find_bytes(stdout, marker_bytes)? + marker_bytes.len();
    let rest = &stdout[start..];
    let end_rel = find_bytes(rest, marker_bytes)?;
    let inner = &rest[..end_rel];
    parse_env_nul(inner)
}

/// Finds the first occurrence of `needle` in `haystack`, returning the byte
/// offset. `None` if not found.
fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || needle.len() > haystack.len() {
        return None;
    }
    (0..=haystack.len() - needle.len()).find(|&i| &haystack[i..i + needle.len()] == needle)
}

fn clean_env_from(env: &ShellEnv, extra_path_prefix: Option<&str>) -> HashMap<String, String> {
    let mut out = env.vars.clone();
    let sep = if cfg!(windows) { ";" } else { ":" };

    let path = match extra_path_prefix {
        Some(prefix) if !prefix.is_empty() => {
            let combined = format!("{}{}{}", prefix, sep, env.path);
            dedupe_path(&combined, sep)
        }
        _ => env.path.clone(),
    };
    out.insert("PATH".to_string(), path);
    out
}

/// Returns candidate shells to try, in order. `$SHELL` first (user's
/// configured shell), then `/bin/zsh` (macOS default), then `/bin/bash`
/// (Linux fallback).
#[cfg(not(windows))]
fn shell_candidates() -> Vec<String> {
    let mut out = Vec::with_capacity(3);
    if let Ok(sh) = std::env::var("SHELL") {
        if !sh.is_empty() {
            out.push(sh);
        }
    }
    for fallback in ["/bin/zsh", "/bin/bash"] {
        if !out.iter().any(|s| s == fallback) {
            out.push(fallback.to_string());
        }
    }
    out
}

fn make_marker() -> String {
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("__OPENACP_SHELL_ENV_{pid}_{nanos}__")
}

/// Runs a command with a hard timeout. On timeout, kills the child and
/// returns `None`. Uses wait-timeout crate.
#[cfg(not(windows))]
fn run_with_timeout(
    mut cmd: std::process::Command,
    timeout: Duration,
) -> Option<std::process::Output> {
    use wait_timeout::ChildExt;

    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().ok()?;

    match child.wait_timeout(timeout).ok()? {
        Some(_status) => {
            let output = child.wait_with_output().ok()?;
            Some(output)
        }
        None => {
            let _ = child.kill();
            let _ = child.wait();
            tracing::warn!("shell_env: shell command timed out after {:?}", timeout);
            None
        }
    }
}

/// Spawns `$shell -ilc 'printf MARK; env -0; printf MARK'` with a timeout,
/// extracts and parses the marked env block. Ignores exit code and stderr
/// — trusts only the marked block in stdout.
#[cfg(not(windows))]
fn resolve_via_marker(shell: &str, timeout: Duration) -> Option<HashMap<String, String>> {
    let marker = make_marker();
    let script = format!("printf '%s' '{marker}'; env -0; printf '%s' '{marker}'");

    let mut cmd = std::process::Command::new(shell);
    cmd.args(["-ilc", &script]);
    // Prevent oh-my-zsh auto-update from blocking the command.
    cmd.env("DISABLE_AUTO_UPDATE", "true");
    if let Some(home) = dirs::home_dir() {
        cmd.current_dir(home);
    }

    let output = run_with_timeout(cmd, timeout)?;
    extract_marked_env(&output.stdout, &marker)
}

fn resolve_blocking() -> ShellEnv {
    #[cfg(windows)]
    {
        return ShellEnv::from_process_env();
    }
    #[cfg(not(windows))]
    {
        let shells = shell_candidates();
        for shell in &shells {
            if let Some(vars) = resolve_via_marker(shell, TIMEOUT) {
                tracing::info!(
                    "shell_env: resolved via {} ({} vars)",
                    shell,
                    vars.len()
                );
                return ShellEnv::from_vars(vars, Some(shell.clone()));
            }
        }
        tracing::warn!(
            "shell_env: all shells failed (tried {}), falling back to std::env",
            shells.join(", ")
        );
        ShellEnv::from_process_env()
    }
}

impl ShellEnv {
    fn from_vars(mut vars: HashMap<String, String>, resolved_via: Option<String>) -> Self {
        for key in DENYLIST {
            vars.remove(*key);
        }
        let shell_path = vars.get("PATH").cloned().unwrap_or_default();
        let path = Self::build_path(&shell_path);
        Self { vars, path, resolved_via }
    }

    fn from_process_env() -> Self {
        let vars: HashMap<String, String> = std::env::vars().collect();
        Self::from_vars(vars, None)
    }

    fn build_path(shell_path: &str) -> String {
        #[cfg(windows)]
        {
            return dedupe_path(shell_path, ";");
        }
        #[cfg(not(windows))]
        {
            let sep = ":";
            let mut parts: Vec<String> = shell_path
                .split(sep)
                .filter(|p| !p.is_empty())
                .map(|p| p.to_string())
                .collect();
            for dir in WELL_KNOWN_NODE_DIRS {
                if std::path::Path::new(dir).exists() {
                    parts.push((*dir).to_string());
                }
            }
            dedupe_path(&parts.join(sep), sep)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_env_nul_basic() {
        let input = b"FOO=bar\0BAZ=qux\0";
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(env.get("BAZ"), Some(&"qux".to_string()));
    }

    #[test]
    fn parse_env_nul_handles_multiline_values() {
        let input = b"MULTI=line1\nline2\nline3\0FOO=bar\0";
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.get("MULTI"), Some(&"line1\nline2\nline3".to_string()));
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
    }

    #[test]
    fn parse_env_nul_handles_empty_values() {
        let input = b"EMPTY=\0HAS=value\0";
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.get("EMPTY"), Some(&String::new()));
        assert_eq!(env.get("HAS"), Some(&"value".to_string()));
    }

    #[test]
    fn parse_env_nul_skips_entries_without_equals() {
        let input = b"GOOD=yes\0NOEQUALS\0ALSO=ok\0";
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.len(), 2);
        assert!(env.contains_key("GOOD"));
        assert!(env.contains_key("ALSO"));
        assert!(!env.contains_key("NOEQUALS"));
    }

    #[test]
    fn parse_env_nul_handles_trailing_data_without_nul() {
        let input = b"FOO=bar\0BAZ=qux";
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(env.get("BAZ"), Some(&"qux".to_string()));
    }

    #[test]
    fn extract_marked_env_basic() {
        let mark = "__TEST_MARK__";
        let mut stdout = Vec::new();
        stdout.extend_from_slice(mark.as_bytes());
        stdout.extend_from_slice(b"FOO=bar\0BAZ=qux\0");
        stdout.extend_from_slice(mark.as_bytes());
        let env = extract_marked_env(&stdout, mark).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(env.get("BAZ"), Some(&"qux".to_string()));
    }

    #[test]
    fn extract_marked_env_skips_zshrc_noise_before_first_mark() {
        let mark = "__TEST_MARK__";
        let mut stdout = Vec::new();
        stdout.extend_from_slice(b"Welcome to zsh!\ncompletion warning: foo not found\n");
        stdout.extend_from_slice(mark.as_bytes());
        stdout.extend_from_slice(b"FOO=bar\0");
        stdout.extend_from_slice(mark.as_bytes());
        let env = extract_marked_env(&stdout, mark).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
    }

    #[test]
    fn extract_marked_env_skips_noise_after_last_mark() {
        let mark = "__TEST_MARK__";
        let mut stdout = Vec::new();
        stdout.extend_from_slice(mark.as_bytes());
        stdout.extend_from_slice(b"FOO=bar\0");
        stdout.extend_from_slice(mark.as_bytes());
        stdout.extend_from_slice(b"\ntrailing garbage from shell exit\n");
        let env = extract_marked_env(&stdout, mark).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(env.len(), 1);
    }

    #[test]
    fn extract_marked_env_returns_none_when_marks_missing() {
        let stdout = b"no marks here, just noise";
        assert!(extract_marked_env(stdout, "__MISSING__").is_none());
    }

    #[test]
    fn extract_marked_env_returns_none_when_only_one_mark() {
        let mark = "__TEST_MARK__";
        let mut stdout = Vec::new();
        stdout.extend_from_slice(mark.as_bytes());
        stdout.extend_from_slice(b"FOO=bar\0");
        assert!(extract_marked_env(&stdout, mark).is_none());
    }

    #[test]
    #[cfg(not(windows))]
    fn smoke_resolve_blocking_returns_non_empty_path() {
        let env = resolve_blocking();
        assert!(!env.path.is_empty(), "resolved PATH should not be empty");
        assert!(
            env.vars.contains_key("HOME") || env.vars.contains_key("PATH"),
            "snapshot should contain at least one of HOME or PATH"
        );
    }

    #[test]
    fn clean_env_from_copies_vars_and_overrides_path() {
        let mut vars = HashMap::new();
        vars.insert("PATH".into(), "/base/bin".into());
        vars.insert("HOME".into(), "/home/user".into());
        let env = ShellEnv {
            vars,
            path: "/base/bin:/extra/bin".into(),
            resolved_via: None,
        };

        let out = clean_env_from(&env, None);
        assert_eq!(out.get("HOME"), Some(&"/home/user".to_string()));
        assert_eq!(out.get("PATH"), Some(&"/base/bin:/extra/bin".to_string()));
    }

    #[test]
    fn clean_env_from_prepends_extra_path_prefix() {
        let mut vars = HashMap::new();
        vars.insert("PATH".into(), "/base/bin".into());
        let env = ShellEnv {
            vars,
            path: "/base/bin".into(),
            resolved_via: None,
        };

        let out = clean_env_from(&env, Some("/openacp/bin"));
        let sep = if cfg!(windows) { ";" } else { ":" };
        let path = out.get("PATH").unwrap();
        assert!(path.starts_with("/openacp/bin"), "path must start with prefix: {path}");
        assert!(
            path.contains(&format!("{sep}/base/bin")),
            "path must contain base: {path}"
        );
    }

    #[test]
    fn clean_env_from_dedupes_extra_prefix_if_already_present() {
        let mut vars = HashMap::new();
        vars.insert("PATH".into(), "/openacp/bin:/usr/bin".into());
        let env = ShellEnv {
            vars,
            path: "/openacp/bin:/usr/bin".into(),
            resolved_via: None,
        };

        let out = clean_env_from(&env, Some("/openacp/bin"));
        let path = out.get("PATH").unwrap();
        let count = path
            .split(if cfg!(windows) { ';' } else { ':' })
            .filter(|p| *p == "/openacp/bin")
            .count();
        assert_eq!(count, 1, "should not duplicate existing entry: {path}");
    }

    #[test]
    fn from_vars_strips_denylist_entries() {
        let mut vars = HashMap::new();
        vars.insert("PATH".into(), "/usr/bin".into());
        vars.insert("NODE_OPTIONS".into(), "--require /tmp/evil.js".into());
        vars.insert("NODE_PATH".into(), "/tmp/pwned".into());
        vars.insert("BASH_ENV".into(), "/tmp/rc".into());
        vars.insert("ENV".into(), "/tmp/rc".into());
        vars.insert("npm_config_prefix".into(), "/tmp/bad".into());
        vars.insert("NPM_CONFIG_PREFIX".into(), "/tmp/bad".into());
        vars.insert("HOME".into(), "/home/user".into());

        let env = ShellEnv::from_vars(vars, Some("zsh".into()));
        assert!(!env.vars.contains_key("NODE_OPTIONS"));
        assert!(!env.vars.contains_key("NODE_PATH"));
        assert!(!env.vars.contains_key("BASH_ENV"));
        assert!(!env.vars.contains_key("ENV"));
        assert!(!env.vars.contains_key("npm_config_prefix"));
        assert!(!env.vars.contains_key("NPM_CONFIG_PREFIX"));
        assert!(env.vars.contains_key("HOME"));
        assert!(env.vars.contains_key("PATH"));
        assert_eq!(env.resolved_via, Some("zsh".into()));
    }

    #[test]
    fn from_vars_uses_shell_path_as_basis_for_path_field() {
        let mut vars = HashMap::new();
        vars.insert("PATH".into(), "/usr/bin:/usr/local/bin".into());
        let env = ShellEnv::from_vars(vars, None);
        assert!(env.path.contains("/usr/bin"));
        assert!(env.path.contains("/usr/local/bin"));
    }

    #[test]
    fn from_vars_handles_missing_path_var() {
        let vars = HashMap::new();
        let env = ShellEnv::from_vars(vars, None);
        let _ = env.path;
    }

    #[test]
    fn build_path_dedupes_and_preserves_shell_path() {
        let shell_path = "/opt/homebrew/bin:/usr/bin:/opt/homebrew/bin";
        let built = ShellEnv::build_path(shell_path);
        let parts: Vec<&str> = built.split(':').collect();
        let bhbrew = parts.iter().filter(|p| **p == "/opt/homebrew/bin").count();
        assert_eq!(bhbrew, 1, "homebrew bin should appear exactly once: {built}");
        assert!(built.contains("/usr/bin"));
    }

    #[test]
    fn build_path_contains_original_shell_entries() {
        let shell_path = "/some/custom/bin:/another/bin";
        let built = ShellEnv::build_path(shell_path);
        assert!(built.contains("/some/custom/bin"));
        assert!(built.contains("/another/bin"));
    }

    #[test]
    fn dedupe_path_removes_duplicates_preserving_order() {
        let input = "/usr/bin:/usr/local/bin:/usr/bin:/opt/homebrew/bin:/usr/local/bin";
        let out = dedupe_path(input, ":");
        assert_eq!(out, "/usr/bin:/usr/local/bin:/opt/homebrew/bin");
    }

    #[test]
    fn dedupe_path_handles_empty_string() {
        assert_eq!(dedupe_path("", ":"), "");
    }

    #[test]
    fn dedupe_path_skips_empty_segments() {
        let input = ":/usr/bin::/usr/local/bin:";
        let out = dedupe_path(input, ":");
        assert_eq!(out, "/usr/bin:/usr/local/bin");
    }

    #[test]
    fn dedupe_path_windows_separator() {
        let input = r"C:\foo;C:\bar;C:\foo";
        let out = dedupe_path(input, ";");
        assert_eq!(out, r"C:\foo;C:\bar");
    }

    #[test]
    fn parse_env_nul_ignores_invalid_utf8_entries() {
        let input: &[u8] = &[
            b'F', b'O', b'O', b'=', b'b', b'a', b'r', 0,
            b'B', b'A', b'D', b'=', 0xFF, 0xFE, 0,
            b'O', b'K', b'=', b'y', b'e', b's', 0,
        ];
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(env.get("OK"), Some(&"yes".to_string()));
        assert!(!env.contains_key("BAD"));
    }
}
