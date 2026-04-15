# Unified Shell Environment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single `core/shell_env.rs` module in the Tauri backend that resolves the user's shell environment once per app lifetime, caches it, and replaces the 4+ scattered shell-spawning code paths across `binary.rs`, `setup.rs`, and `commands.rs`.

**Architecture:** A new module exports `prewarm() / snapshot() / path() / clean_env()`. At startup `lib.rs::run()` runs `fix_path_env::fix()` (mutates `std::env::PATH` process-wide) and spawns `shell_env::prewarm()` on a dedicated OS thread. Prewarm spawns `$SHELL -ilc 'printf MARK; env -0; printf MARK'`, parses out the NUL-delimited env ignoring exit code and `.zshrc` noise, strips a DENYLIST of injection vectors, and caches into a `OnceLock<ShellEnv>`. All consumer sites (`binary::find_openacp_binary`, `setup::{build_openacp_path, openacp_command, run_setup, agent_install}`, `commands::get_node_info`) read from the cache instead of spawning shells.

**Tech Stack:** Rust, Tauri 2, `tauri-plugin-shell`, `tokio::process`, `std::process`. New crate deps: `fix-path-env` (git, tauri-apps/fix-path-env-rs dev branch — not on crates.io), `wait-timeout = "0.2"`.

**Spec:** `docs/superpowers/specs/2026-04-15-unified-shell-env-design.md`

**Branch:** `refactor/shell-env` (already checked out)

---

## File Structure

**New files:**
- `src-tauri/src/core/shell_env.rs` — the module (all logic + unit tests)

**Modified files:**
- `src-tauri/Cargo.toml` — add `fix-path-env` (git) and `wait-timeout` deps
- `src-tauri/src/core/mod.rs` — register `pub mod shell_env;`
- `src-tauri/src/lib.rs` — call `fix_path_env::fix()` first thing + spawn prewarm thread
- `src-tauri/src/core/sidecar/binary.rs` — delete `resolve_via_shell`, `get_login_shell_path`, `prepend_path`; add `which_openacp` using `shell_env::path()`
- `src-tauri/src/core/onboarding/setup.rs` — simplify `build_openacp_path`, use `shell_env::clean_env` in all spawn sites, drop inline node-dir shell resolution
- `src-tauri/src/core/onboarding/commands.rs` — migrate `get_node_info` fallback to use `shell_env::path()`; add `shell_env_*` fields to `get_debug_info`

**Unchanged:**
- Frontend TypeScript — `get_debug_info` already returns `HashMap<String,String>` so new keys appear automatically in Copy Debug Info UI. No frontend changes needed.

---

## Task 1: Add dependencies and scaffold shell_env module

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/core/mod.rs`
- Create: `src-tauri/src/core/shell_env.rs`

- [ ] **Step 1.1: Add deps to `src-tauri/Cargo.toml`**

In the `[dependencies]` section, after the existing `ignore = "0.4.25"` line, add:

```toml
wait-timeout = "0.2"
fix-path-env = { git = "https://github.com/tauri-apps/fix-path-env-rs", branch = "dev" }
```

Note: `fix-path-env` is not published on crates.io — the `tauri-apps/fix-path-env-rs` repo's `dev` branch contains the latest `fix()` API. Confirmed by fetching `Cargo.toml` from that branch (package name `fix-path-env`, version `0.0.0`).

- [ ] **Step 1.2: Create `src-tauri/src/core/shell_env.rs` scaffold**

Write the full file with public API signatures as `todo!()` stubs plus the `ShellEnv` struct, so downstream tasks can reference real symbols:

```rust
//! Resolves the user's shell environment exactly once per app lifetime and
//! caches it in a `OnceLock<ShellEnv>`. Every spawn site in the app reads
//! from this cache instead of spawning a shell itself.
//!
//! See `docs/superpowers/specs/2026-04-15-unified-shell-env-design.md`.

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
    let _ = extra_path_prefix;
    todo!("implemented in later task")
}

/// Dedupe PATH entries while preserving order of first occurrence.
pub fn dedupe_path(path: &str, sep: &str) -> String {
    let _ = (path, sep);
    todo!("implemented in later task")
}

// ─── Internals (implemented in later tasks) ─────────────────────────────

fn resolve_blocking() -> ShellEnv {
    todo!("implemented in later task")
}

impl ShellEnv {
    fn from_vars(_vars: HashMap<String, String>, _resolved_via: Option<String>) -> Self {
        todo!("implemented in later task")
    }

    fn from_process_env() -> Self {
        todo!("implemented in later task")
    }

    fn build_path(_shell_path: &str) -> String {
        todo!("implemented in later task")
    }
}
```

- [ ] **Step 1.3: Register module in `src-tauri/src/core/mod.rs`**

Current content:
```rust
pub mod browser;
pub mod filesystem;
pub mod keychain;
pub mod logging;
pub mod onboarding;
pub mod pty;
pub mod sidecar;
```

Add `pub mod shell_env;` alphabetically (after `pty`, before `sidecar`):

```rust
pub mod browser;
pub mod filesystem;
pub mod keychain;
pub mod logging;
pub mod onboarding;
pub mod pty;
pub mod shell_env;
pub mod sidecar;
```

- [ ] **Step 1.4: Build to verify scaffolding compiles**

Run: `cd src-tauri && cargo build 2>&1 | tail -20`

Expected: `Compiling openacp-desktop ...` → `Finished` (may show warnings about unused code / `todo!` — those are fine). If the build fails, the most likely cause is the `fix-path-env` git dep URL — double-check the branch is `dev`.

- [ ] **Step 1.5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/core/mod.rs src-tauri/src/core/shell_env.rs
git commit -m "$(cat <<'EOF'
feat(shell_env): scaffold module with public API stubs

Adds fix-path-env (git) and wait-timeout deps. Creates
core/shell_env.rs with DENYLIST, ShellEnv struct, and
todo!-stubbed public API. Subsequent tasks implement each
function with TDD.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Implement `parse_env_nul` with tests

NUL-delimited env parser — splits `KEY=VALUE\0KEY=VALUE\0...` into a `HashMap`. Handles empty values, skips entries without `=`, and preserves values containing newlines.

**Files:**
- Modify: `src-tauri/src/core/shell_env.rs`

- [ ] **Step 2.1: Write failing tests**

At the bottom of `src-tauri/src/core/shell_env.rs`, add:

```rust
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
        // env -0 always ends with \0 but defensive parsing shouldn't drop
        // the last entry if it's missing.
        let input = b"FOO=bar\0BAZ=qux";
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(env.get("BAZ"), Some(&"qux".to_string()));
    }

    #[test]
    fn parse_env_nul_ignores_invalid_utf8_entries() {
        // Invalid UTF-8 bytes in one entry shouldn't poison the whole parse
        let input: &[u8] = &[b'F', b'O', b'O', b'=', b'b', b'a', b'r', 0,
                             b'B', b'A', b'D', b'=', 0xFF, 0xFE, 0,
                             b'O', b'K', b'=', b'y', b'e', b's', 0];
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(env.get("OK"), Some(&"yes".to_string()));
        assert!(!env.contains_key("BAD"));
    }
}
```

Also at the top of the file (above the `ShellEnv` struct), add the private function stub:

```rust
/// Parses a NUL-delimited env buffer (output of `env -0`) into a HashMap.
/// Skips entries that lack `=`, entries with invalid UTF-8, and empty
/// segments. Returns `None` only if the entire input is empty.
fn parse_env_nul(_bytes: &[u8]) -> Option<HashMap<String, String>> {
    todo!()
}
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::parse_env_nul 2>&1 | tail -30`

Expected: Tests panic at `todo!()` (compilation succeeds, tests fail at runtime).

- [ ] **Step 2.3: Implement `parse_env_nul`**

Replace the `todo!()` body with:

```rust
fn parse_env_nul(bytes: &[u8]) -> Option<HashMap<String, String>> {
    if bytes.is_empty() {
        return None;
    }
    let mut map = HashMap::new();
    for entry in bytes.split(|&b| b == 0) {
        if entry.is_empty() {
            continue;
        }
        // Find first '=' as byte (0x3D)
        let eq_pos = match entry.iter().position(|&b| b == b'=') {
            Some(p) => p,
            None => continue, // no '=', skip
        };
        // Key must be valid UTF-8
        let key = match std::str::from_utf8(&entry[..eq_pos]) {
            Ok(k) => k.to_string(),
            Err(_) => continue,
        };
        // Value must be valid UTF-8
        let value = match std::str::from_utf8(&entry[eq_pos + 1..]) {
            Ok(v) => v.to_string(),
            Err(_) => continue,
        };
        map.insert(key, value);
    }
    Some(map)
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::parse_env_nul 2>&1 | tail -15`

Expected: `test result: ok. 6 passed; 0 failed` for the parse_env_nul tests.

- [ ] **Step 2.5: Commit**

```bash
git add src-tauri/src/core/shell_env.rs
git commit -m "$(cat <<'EOF'
feat(shell_env): parse_env_nul + tests

NUL-delimited env parser for `env -0` output. Handles:
- Multi-line values (LS_COLORS, cert chains)
- Empty values
- Entries missing '=' (skipped)
- Invalid UTF-8 in individual entries (skipped, not poisoning the whole parse)
- Trailing entry without terminating NUL

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Implement `extract_marked_env` with tests

Given stdout from the shell command `printf MARK; env -0; printf MARK`, locate the marked block, ignore everything before/after, and hand the inner bytes to `parse_env_nul`.

**Files:**
- Modify: `src-tauri/src/core/shell_env.rs`

- [ ] **Step 3.1: Write failing tests**

In the existing `tests` mod (bottom of the file), add:

```rust
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
```

Add the function stub above the existing `parse_env_nul` function:

```rust
/// Given shell stdout containing `MARK...env -0 output...MARK`, extract the
/// bytes between the two marks and parse them. Returns `None` if both marks
/// aren't present.
fn extract_marked_env(stdout: &[u8], marker: &str) -> Option<HashMap<String, String>> {
    let _ = (stdout, marker);
    todo!()
}
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::extract_marked_env 2>&1 | tail -20`

Expected: 5 tests panic at `todo!()`.

- [ ] **Step 3.3: Implement `extract_marked_env`**

Replace the `todo!()` body:

```rust
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
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::extract_marked_env 2>&1 | tail -15`

Expected: `test result: ok. 5 passed`.

- [ ] **Step 3.5: Commit**

```bash
git add src-tauri/src/core/shell_env.rs
git commit -m "$(cat <<'EOF'
feat(shell_env): extract_marked_env + find_bytes + tests

Extracts the env payload between two UUID markers in shell
stdout. Skips .zshrc noise before the first mark and any
trailing output after the second. Adapted from VS Code's
resolveShellEnv pattern.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement `dedupe_path` with tests

Pure utility — splits a PATH string on separator, preserves first occurrence of each entry, rejoins.

**Files:**
- Modify: `src-tauri/src/core/shell_env.rs`

- [ ] **Step 4.1: Write failing tests**

Add to `tests` mod:

```rust
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
    // Leading/trailing/double colons produce empty segments that we drop
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
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::dedupe_path 2>&1 | tail -15`

Expected: 4 tests panic at `todo!()`.

- [ ] **Step 4.3: Implement `dedupe_path`**

Replace the stub body in the public API section:

```rust
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
```

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::dedupe_path 2>&1 | tail -15`

Expected: `test result: ok. 4 passed`.

- [ ] **Step 4.5: Commit**

```bash
git add src-tauri/src/core/shell_env.rs
git commit -m "$(cat <<'EOF'
feat(shell_env): dedupe_path + tests

Order-preserving PATH dedupe used by both ShellEnv::build_path
and setup::build_openacp_path to avoid duplicate entries when
merging shell PATH with openacp/node directories.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Implement `ShellEnv::build_path` with tests

Given a shell `PATH` string, prepend well-known node dirs that exist on the filesystem and dedupe.

**Files:**
- Modify: `src-tauri/src/core/shell_env.rs`

- [ ] **Step 5.1: Write failing tests**

Add to `tests` mod:

```rust
#[test]
fn build_path_dedupes_and_preserves_shell_path() {
    // Synthetic shell_path contains /opt/homebrew/bin twice
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
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::build_path 2>&1 | tail -15`

Expected: 2 tests panic at `todo!()`.

- [ ] **Step 5.3: Implement `build_path`**

Replace the stub body in the `impl ShellEnv` block:

```rust
impl ShellEnv {
    fn build_path(shell_path: &str) -> String {
        #[cfg(windows)]
        {
            // On Windows we don't have well-known node dirs to merge —
            // `fix_path_env::fix()` already refreshed std::env::PATH.
            return dedupe_path(shell_path, ";");
        }
        #[cfg(not(windows))]
        {
            let sep = ":";
            // Start with the shell's PATH as-is to preserve ordering.
            let mut parts: Vec<String> = shell_path
                .split(sep)
                .filter(|p| !p.is_empty())
                .map(|p| p.to_string())
                .collect();
            // Append well-known node dirs that actually exist on disk.
            for dir in WELL_KNOWN_NODE_DIRS {
                if std::path::Path::new(dir).exists() {
                    parts.push((*dir).to_string());
                }
            }
            // Dedupe preserving first occurrence.
            dedupe_path(&parts.join(sep), sep)
        }
    }
    // ... other methods come in later tasks ...
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::build_path 2>&1 | tail -15`

Expected: `test result: ok. 2 passed`.

- [ ] **Step 5.5: Commit**

```bash
git add src-tauri/src/core/shell_env.rs
git commit -m "$(cat <<'EOF'
feat(shell_env): ShellEnv::build_path

Merges well-known node dirs (/usr/local/bin, /opt/homebrew/bin)
into the shell PATH if they exist on disk, then dedupes. This
is the precomputed PATH that every consumer reads via
shell_env::path() — no filesystem touches after resolve time.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Implement `ShellEnv::from_vars`, `from_process_env`, and DENYLIST filtering

**Files:**
- Modify: `src-tauri/src/core/shell_env.rs`

- [ ] **Step 6.1: Write failing tests**

Add to `tests` mod:

```rust
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
    // If the shell for some reason has no PATH (extremely unlikely), we
    // fall back to empty string (plus well-known dirs from build_path).
    let vars = HashMap::new();
    let env = ShellEnv::from_vars(vars, None);
    // Should not panic and should produce a non-panicking string.
    let _ = env.path;
}
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::from_vars 2>&1 | tail -15`

Expected: 3 tests panic at `todo!()`.

- [ ] **Step 6.3: Implement `from_vars` and `from_process_env`**

Replace the stub bodies in the `impl ShellEnv` block:

```rust
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
        // body from Task 5 — leave unchanged
        #[cfg(windows)]
        { return dedupe_path(shell_path, ";"); }
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
```

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::from_vars 2>&1 | tail -15`

Expected: `test result: ok. 3 passed`.

- [ ] **Step 6.5: Commit**

```bash
git add src-tauri/src/core/shell_env.rs
git commit -m "$(cat <<'EOF'
feat(shell_env): from_vars + from_process_env + DENYLIST filtering

DENYLIST strips NODE_OPTIONS, NODE_PATH, BASH_ENV, ENV,
npm_config_prefix (both casings) from the cached env.
from_process_env is the fallback used when shell resolution
fails — reads std::env after fix_path_env::fix() has run.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Implement `clean_env` with tests

Returns the env HashMap a spawn site should use. Based on the snapshot vars, with an optional extra path prefix prepended.

**Files:**
- Modify: `src-tauri/src/core/shell_env.rs`

- [ ] **Step 7.1: Write failing tests**

Note: `clean_env` reads from the `SNAPSHOT` `OnceLock` which will trigger a real shell resolve during unit tests on the dev machine. To keep tests hermetic, we'll test the `clean_env` logic via a helper that takes an explicit `ShellEnv` reference and leave a smoke test for the public function.

Restructure `clean_env` to split out the pure logic:

```rust
// Pure helper — testable without touching SNAPSHOT.
fn clean_env_from(env: &ShellEnv, extra_path_prefix: Option<&str>) -> HashMap<String, String> {
    todo!()
}

pub fn clean_env(extra_path_prefix: Option<&str>) -> HashMap<String, String> {
    clean_env_from(snapshot(), extra_path_prefix)
}
```

Add tests:

```rust
#[test]
fn clean_env_from_copies_vars_and_overrides_path() {
    let mut vars = HashMap::new();
    vars.insert("PATH".into(), "/base/bin".into());
    vars.insert("HOME".into(), "/home/user".into());
    let env = ShellEnv { vars, path: "/base/bin:/extra/bin".into(), resolved_via: None };

    let out = clean_env_from(&env, None);
    assert_eq!(out.get("HOME"), Some(&"/home/user".to_string()));
    // PATH should be the env.path field (with well-known dirs), not the raw
    // vars["PATH"].
    assert_eq!(out.get("PATH"), Some(&"/base/bin:/extra/bin".to_string()));
}

#[test]
fn clean_env_from_prepends_extra_path_prefix() {
    let mut vars = HashMap::new();
    vars.insert("PATH".into(), "/base/bin".into());
    let env = ShellEnv { vars, path: "/base/bin".into(), resolved_via: None };

    let out = clean_env_from(&env, Some("/openacp/bin"));
    let sep = if cfg!(windows) { ";" } else { ":" };
    let path = out.get("PATH").unwrap();
    assert!(path.starts_with("/openacp/bin"), "path must start with prefix: {path}");
    assert!(path.contains(&format!("{sep}/base/bin")), "path must contain base: {path}");
}

#[test]
fn clean_env_from_dedupes_extra_prefix_if_already_present() {
    let mut vars = HashMap::new();
    vars.insert("PATH".into(), "/openacp/bin:/usr/bin".into());
    let env = ShellEnv { vars, path: "/openacp/bin:/usr/bin".into(), resolved_via: None };

    let out = clean_env_from(&env, Some("/openacp/bin"));
    let path = out.get("PATH").unwrap();
    let count = path.split(if cfg!(windows) { ';' } else { ':' })
        .filter(|p| *p == "/openacp/bin")
        .count();
    assert_eq!(count, 1, "should not duplicate existing entry: {path}");
}
```

- [ ] **Step 7.2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::clean_env_from 2>&1 | tail -15`

Expected: 3 tests panic at `todo!()`.

- [ ] **Step 7.3: Implement `clean_env_from`**

Replace the `todo!()` body:

```rust
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
```

- [ ] **Step 7.4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::clean_env_from 2>&1 | tail -15`

Expected: `test result: ok. 3 passed`.

- [ ] **Step 7.5: Run the full module test suite**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env 2>&1 | tail -20`

Expected: all tests pass (23 total: 6 parse_env_nul + 5 extract_marked_env + 4 dedupe_path + 2 build_path + 3 from_vars + 3 clean_env_from).

- [ ] **Step 7.6: Commit**

```bash
git add src-tauri/src/core/shell_env.rs
git commit -m "$(cat <<'EOF'
feat(shell_env): clean_env + clean_env_from + tests

Pure helper clean_env_from splits logic from the SNAPSHOT
lookup so it's unit-testable. Prepends optional extra path
prefix and dedupes to avoid adding the openacp bin dir twice
when it's already in the shell PATH.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Implement `resolve_via_marker`, `resolve_blocking`, `make_marker`, `shell_candidates`, `run_with_timeout`

The actual shell spawn. No unit tests — this touches real processes. Manual verification only.

**Files:**
- Modify: `src-tauri/src/core/shell_env.rs`

- [ ] **Step 8.1: Implement shell_candidates**

Add to the internals section (below `parse_env_nul`):

```rust
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
```

- [ ] **Step 8.2: Implement make_marker**

Add below `shell_candidates`:

```rust
fn make_marker() -> String {
    let pid = std::process::id();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("__OPENACP_SHELL_ENV_{pid}_{nanos}__")
}
```

- [ ] **Step 8.3: Implement run_with_timeout**

Add below `make_marker`:

```rust
/// Runs a command with a hard timeout. On timeout, kills the child and
/// returns `None`. Uses wait-timeout crate.
#[cfg(not(windows))]
fn run_with_timeout(mut cmd: std::process::Command, timeout: Duration) -> Option<std::process::Output> {
    use wait_timeout::ChildExt;

    // Pipe stdin from /dev/null so the shell never waits for input.
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().ok()?;

    match child.wait_timeout(timeout).ok()? {
        Some(_status) => {
            // Finished within timeout — collect output.
            let output = child.wait_with_output().ok()?;
            Some(output)
        }
        None => {
            // Timeout — kill and return None.
            let _ = child.kill();
            let _ = child.wait();
            tracing::warn!("shell_env: shell command timed out after {:?}", timeout);
            None
        }
    }
}
```

- [ ] **Step 8.4: Implement resolve_via_marker**

Add below `run_with_timeout`:

```rust
/// Spawns `$shell -ilc 'printf MARK; env -0; printf MARK'` with a timeout,
/// extracts and parses the marked env block. Ignores exit code and stderr
/// — trusts only the marked block in stdout.
#[cfg(not(windows))]
fn resolve_via_marker(shell: &str, timeout: Duration) -> Option<HashMap<String, String>> {
    let marker = make_marker();
    // Use printf %s to write the marker without a trailing newline, so
    // extraction finds exact byte boundaries.
    let script = format!(
        "printf '%s' '{marker}'; env -0; printf '%s' '{marker}'"
    );

    let mut cmd = std::process::Command::new(shell);
    cmd.args(["-ilc", &script]);
    // Prevent oh-my-zsh auto-update from blocking the command.
    cmd.env("DISABLE_AUTO_UPDATE", "true");
    // Run in home dir so shell init files find their expected context.
    if let Some(home) = dirs::home_dir() {
        cmd.current_dir(home);
    }

    let output = run_with_timeout(cmd, timeout)?;
    extract_marked_env(&output.stdout, &marker)
}
```

- [ ] **Step 8.5: Implement resolve_blocking**

Replace the existing `todo!()` stub of `resolve_blocking`:

```rust
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
```

- [ ] **Step 8.6: Build and run full test suite**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env 2>&1 | tail -20`

Expected: All 23 unit tests still pass (the `resolve_*` functions are untested but the rest are).

- [ ] **Step 8.7: Add a smoke test that actually resolves the shell**

This will spawn a real shell on the dev machine. Only runs on non-Windows.

Add to `tests` mod:

```rust
#[test]
#[cfg(not(windows))]
fn smoke_resolve_blocking_returns_non_empty_path() {
    let env = resolve_blocking();
    assert!(!env.path.is_empty(), "resolved PATH should not be empty");
    assert!(env.vars.contains_key("HOME") || env.vars.contains_key("PATH"),
            "snapshot should contain at least one of HOME or PATH");
}
```

Run: `cd src-tauri && cargo test -p openacp-desktop --lib shell_env::tests::smoke_resolve_blocking 2>&1 | tail -20`

Expected: Passes. If the dev machine has a working `.zshrc`, it should resolve via `$SHELL`. If not, it falls back to `std::env` and still passes because `std::env::PATH` is non-empty.

- [ ] **Step 8.8: Commit**

```bash
git add src-tauri/src/core/shell_env.rs
git commit -m "$(cat <<'EOF'
feat(shell_env): resolve_via_marker + resolve_blocking + helpers

Implements the actual shell spawn logic: shell_candidates,
make_marker, run_with_timeout (via wait-timeout crate),
resolve_via_marker (UUID mark + env -0 pattern), and
resolve_blocking (tries $SHELL then /bin/zsh then /bin/bash,
falls back to std::env on all failures).

Includes a smoke test that resolves the real shell on the
dev machine.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire up at startup in `lib.rs::run()`

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 9.1: Add `fix_path_env::fix()` and `shell_env::prewarm` calls**

Find this block in `src-tauri/src/lib.rs` (around line 31-44):

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "openacp_lib=debug".parse().unwrap()),
        )
        .init();

    // Initialize file logger for diagnostics
    core::logging::init();
    core::logging::write_line("INFO", "be", "OpenACP Desktop starting");

    let sidecar = Arc::new(Mutex::new(SidecarManager::new()));
```

Replace with:

```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // MUST be first: mutates std::env::PATH process-wide so subsequent
    // code (tracing init, dirs::home_dir, async runtime, tauri internals)
    // sees the user's real shell PATH. Errors are non-fatal — we still
    // have the dedicated shell_env::prewarm as a second line of defense.
    let _ = fix_path_env::fix();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "openacp_lib=debug".parse().unwrap()),
        )
        .init();

    // Initialize file logger for diagnostics
    core::logging::init();
    core::logging::write_line("INFO", "be", "OpenACP Desktop starting");

    // Prewarm the shell env cache on a dedicated OS thread (not the tokio
    // runtime) so a slow .zshrc never blocks Tauri async work. The first
    // caller of shell_env::snapshot() will block on the OnceLock if this
    // isn't done yet, bounded by TIMEOUT.
    std::thread::spawn(|| core::shell_env::prewarm());

    let sidecar = Arc::new(Mutex::new(SidecarManager::new()));
```

- [ ] **Step 9.2: Build to verify compilation**

Run: `cd src-tauri && cargo build 2>&1 | tail -15`

Expected: `Finished`.

- [ ] **Step 9.3: Dev-run the app and check logs**

Run: `cd /Users/longdao/Projects/OpenACP-App && bun tauri dev 2>&1 | head -40 &` (or however the user normally runs dev — leave it to manual verification step)

**Manual verification** — look for these log lines on startup:
```
shell_env: resolved via /bin/zsh (NN vars)
```
or, if fallback:
```
shell_env: all shells failed (tried ...), falling back to std::env
```

The user should verify in their terminal and confirm before proceeding. Kill the dev server after confirmation.

- [ ] **Step 9.4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
feat: wire up fix_path_env + shell_env::prewarm at startup

fix_path_env::fix() runs first in run() so std::env::PATH
is correct for all subsequent code. shell_env::prewarm()
runs on a dedicated OS thread so a slow .zshrc never blocks
the tokio runtime.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Migrate `core/sidecar/binary.rs`

Delete `resolve_via_shell`, `get_login_shell_path`, `prepend_path`. Add `which_openacp` that uses `shell_env::path()`.

**Files:**
- Modify: `src-tauri/src/core/sidecar/binary.rs`

- [ ] **Step 10.1: Replace entire file content**

Rewrite `src-tauri/src/core/sidecar/binary.rs` (keeping only `find_openacp_binary`, `bin_dir_for_path`, `check_known_locations`, and the new `which_openacp`):

```rust
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

/// Check platform-specific well-known install locations. Unchanged from
/// prior version — still useful as a last-resort fallback when shell env
/// resolution fails entirely.
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
```

Note: `resolve_via_shell`, `get_login_shell_path`, and `prepend_path` are all deleted.

- [ ] **Step 10.2: Check for unused import errors elsewhere**

Run: `cd src-tauri && cargo build 2>&1 | tail -30`

Expected: **Build may fail** with errors about `get_login_shell_path` or `prepend_path` no longer existing — that's expected. Note every such error so Task 11 can fix them.

Likely errors in `setup.rs`:
```
error[E0432]: unresolved imports ...::get_login_shell_path, ...::prepend_path
```

These are handled in the next task. For now, proceed to Task 11 even if this build fails.

- [ ] **Step 10.3: Commit (even if setup.rs is temporarily broken)**

This is fine because Task 11 is atomic and will land right after — but if you'd prefer, you can defer this commit until Task 11 and bundle them. Since tasks should produce independently buildable state, **bundle 10 and 11 into a single commit**. Skip this commit step and proceed directly to Task 11.

---

## Task 11: Migrate `core/onboarding/setup.rs`

Simplify `build_openacp_path` to a thin wrapper over `shell_env::path()`. Update all spawn sites to use `shell_env::clean_env`.

**Files:**
- Modify: `src-tauri/src/core/onboarding/setup.rs`

- [ ] **Step 11.1: Rewrite `build_openacp_path`**

Find this function (lines 10-67 of the current file) and replace it entirely with:

```rust
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
    //    right next to openacp in that dir). The well-known dirs from
    //    shell_env already cover /usr/local/bin and /opt/homebrew/bin.
    let openacp_dir = bin.parent().unwrap_or(std::path::Path::new(""));
    let co_located_node = openacp_dir.join("node");
    if co_located_node.exists() {
        parts.push(openacp_dir.to_string_lossy().to_string());
    }

    parts.push(base.to_string());
    crate::core::shell_env::dedupe_path(&parts.join(sep), sep)
}
```

- [ ] **Step 11.2: Update the top-of-file import**

Current first line of `setup.rs`:

```rust
use crate::core::sidecar::binary::{find_openacp_binary, get_login_shell_path, prepend_path};
```

Replace with (drop the removed functions):

```rust
use crate::core::sidecar::binary::find_openacp_binary;
```

- [ ] **Step 11.3: Update `openacp_command` to use `clean_env`**

Find:

```rust
pub fn openacp_command() -> Result<(tokio::process::Command, std::path::PathBuf), String> {
    let (bin, extra_path) = find_openacp_binary()
        .ok_or_else(|| "openacp not found — please install it first".to_string())?;
    let mut cmd = tokio::process::Command::new(&bin);
    cmd.env("PATH", build_openacp_path(&bin, &extra_path));
    Ok((cmd, bin))
}
```

Replace with:

```rust
pub fn openacp_command() -> Result<(tokio::process::Command, std::path::PathBuf), String> {
    let (bin, extra_path) = find_openacp_binary()
        .ok_or_else(|| "openacp not found — please install it first".to_string())?;
    let mut cmd = tokio::process::Command::new(&bin);
    // Build a complete PATH from shell_env, then use that as the extra prefix
    // to clean_env so it becomes the final PATH. This ensures node is findable
    // regardless of how openacp was installed.
    let path_override = build_openacp_path(&bin, &extra_path);
    let env = crate::core::shell_env::clean_env(Some(&path_override));
    cmd.env_clear();
    cmd.envs(env);
    Ok((cmd, bin))
}
```

- [ ] **Step 11.4: Update `run_setup` to use `clean_env`**

Find the `run_setup` function (starts around line 188). Inside it, find:

```rust
    let (bin, extra_path) = find_openacp_binary()
        .ok_or("openacp not found — please install it first")?;
    let mut shell_cmd = app.shell().command(bin.to_string_lossy().to_string());
    shell_cmd = shell_cmd.env("PATH", build_openacp_path(&bin, &extra_path));
```

Replace with:

```rust
    let (bin, extra_path) = find_openacp_binary()
        .ok_or("openacp not found — please install it first")?;
    let path_override = build_openacp_path(&bin, &extra_path);
    let env = crate::core::shell_env::clean_env(Some(&path_override));
    let mut shell_cmd = app.shell().command(bin.to_string_lossy().to_string());
    shell_cmd = shell_cmd.envs(env);
```

Note: `tauri_plugin_shell::Command` has `.envs()` which takes an iterator of `(K, V)`. Verify with the `cargo build` step after this.

- [ ] **Step 11.5: Update `agent_install` to use `clean_env`**

Find the `agent_install` function (starts around line 287). Inside it, find:

```rust
    let (bin, extra_path) = find_openacp_binary()
        .ok_or("openacp not found — please install it first")?;
    let path = build_openacp_path(&bin, &extra_path);
    tracing::info!("agent_install: bin={} PATH={}", bin.display(), &path[..path.len().min(200)]);

    let mut shell_cmd = app.shell().command(bin.to_string_lossy().to_string());
    shell_cmd = shell_cmd.env("PATH", &path);
```

Replace with:

```rust
    let (bin, extra_path) = find_openacp_binary()
        .ok_or("openacp not found — please install it first")?;
    let path_override = build_openacp_path(&bin, &extra_path);
    let env = crate::core::shell_env::clean_env(Some(&path_override));
    tracing::info!(
        "agent_install: bin={} PATH={}",
        bin.display(),
        &path_override[..path_override.len().min(200)]
    );

    let mut shell_cmd = app.shell().command(bin.to_string_lossy().to_string());
    shell_cmd = shell_cmd.envs(env);
```

- [ ] **Step 11.6: Build and fix any errors**

Run: `cd src-tauri && cargo build 2>&1 | tail -30`

If the `tauri_plugin_shell::Command::envs` method doesn't exist or accepts a different type, adapt: check tauri-plugin-shell docs at `https://docs.rs/tauri-plugin-shell/latest/tauri_plugin_shell/process/struct.Command.html` or use `.env(k, v)` in a loop:

```rust
let mut shell_cmd = app.shell().command(bin.to_string_lossy().to_string());
for (k, v) in env {
    shell_cmd = shell_cmd.env(k, v);
}
```

Expected (after any needed adapt): `Finished`.

- [ ] **Step 11.7: Run unit tests to ensure nothing broke**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib 2>&1 | tail -10`

Expected: All tests still pass.

- [ ] **Step 11.8: Commit tasks 10 and 11 together**

```bash
git add src-tauri/src/core/sidecar/binary.rs src-tauri/src/core/onboarding/setup.rs
git commit -m "$(cat <<'EOF'
refactor: migrate binary.rs + setup.rs to shell_env cache

binary.rs:
- Delete resolve_via_shell (was spamming zsh -i/-l on every call)
- Delete get_login_shell_path and prepend_path (dead code)
- Add which_openacp using the cached shell_env::path()

setup.rs:
- Simplify build_openacp_path to a 10-line wrapper over
  shell_env::path() + shell_env::dedupe_path
- openacp_command, run_setup, agent_install all use
  shell_env::clean_env(Some(path_override)) to set the full env
  (not just PATH), killing NODE_OPTIONS/BASH_ENV injection
  vectors via the shared DENYLIST

Consolidates 5 separate fix-* commits on this topic into a
single cache-backed pattern.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Migrate `core/onboarding/commands.rs::get_node_info`

Replace the fragile `shell -i -c "which node && node --version"` fallback with a lookup that uses `shell_env::path()`.

**Files:**
- Modify: `src-tauri/src/core/onboarding/commands.rs`

- [ ] **Step 12.1: Rewrite the `get_node_info` function body**

Find `pub async fn get_node_info()` (around line 73-120) and replace the function body with:

```rust
#[tauri::command]
pub async fn get_node_info() -> Result<Option<(String, String)>, String> {
    use crate::core::sidecar::binary::find_openacp_binary;

    // Strategy 1: Find node in the same directory as openacp binary (same
    // nvm/fnm version, avoids mismatch when multiple installs exist).
    if let Some((openacp_bin, _)) = find_openacp_binary() {
        if let Some(bin_dir) = openacp_bin.parent() {
            let node_path = bin_dir.join("node");
            if node_path.exists() {
                if let Ok(output) = tokio::process::Command::new(&node_path)
                    .arg("--version")
                    .output()
                    .await
                {
                    if output.status.success() {
                        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        return Ok(Some((version, node_path.to_string_lossy().to_string())));
                    }
                }
            }
        }
    }

    // Strategy 2: Use `which node` with the cached shell_env PATH. Replaces
    // the old shell -i -c spawn loop entirely.
    let which_bin = if cfg!(windows) { "where" } else { "/usr/bin/which" };
    let output = tokio::process::Command::new(which_bin)
        .arg("node")
        .env("PATH", crate::core::shell_env::path())
        .output()
        .await
        .ok();
    if let Some(output) = output {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let path = stdout.trim().lines().next().unwrap_or("").trim();
        if (cfg!(windows) && !path.is_empty()) || path.starts_with('/') {
            // Found a node path — get its version.
            if let Ok(version_output) = tokio::process::Command::new(path)
                .arg("--version")
                .env("PATH", crate::core::shell_env::path())
                .output()
                .await
            {
                if version_output.status.success() {
                    let version = String::from_utf8_lossy(&version_output.stdout)
                        .trim()
                        .to_string();
                    return Ok(Some((version, path.to_string())));
                }
            }
        }
    }

    Ok(None)
}
```

- [ ] **Step 12.2: Build**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`

Expected: `Finished`.

- [ ] **Step 12.3: Commit**

```bash
git add src-tauri/src/core/onboarding/commands.rs
git commit -m "$(cat <<'EOF'
refactor(commands): get_node_info uses shell_env cache

Replaces the shell -i/-l fallback loop (which had the same
.zshrc noise problems as binary.rs) with a `which node` call
using shell_env::path(). Preserves the strategy-1 "node
co-located with openacp" preference.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Add `shell_env_*` fields to `get_debug_info` and remove diagnostic logging

Commit 5 from the spec: expose shell env info in Copy Debug Info so future user reports include it, and remove the temporary diagnostic logging from `agent_install` (commit `b7ecd3b`).

**Files:**
- Modify: `src-tauri/src/core/onboarding/commands.rs`
- Modify: `src-tauri/src/core/onboarding/setup.rs`

- [ ] **Step 13.1: Add shell_env fields to `get_debug_info`**

Find `pub async fn get_debug_info(...)` (around line 124). After the `// OS` block and before the `// Config status` block, add:

```rust
    // Shell env snapshot — crucial for debugging future PATH issues
    let snap = crate::core::shell_env::snapshot();
    info.insert(
        "shell_env_resolved_via".into(),
        snap.resolved_via.clone().unwrap_or_else(|| "fallback (std::env)".into()),
    );
    info.insert("shell_env_path".into(), snap.path.clone());
    info.insert("shell_env_vars_count".into(), snap.vars.len().to_string());
```

- [ ] **Step 13.2: Remove diagnostic logging from `agent_install`**

Find `agent_install` in `src-tauri/src/core/onboarding/setup.rs`. Remove the two `crate::core::logging::write_line` calls that were added in commit `b7ecd3b`:

Find and delete:

```rust
    // Log output to file logger for diagnostics
    let combined = output_lines.join("\n");
    crate::core::logging::write_line("INFO", "be", &format!("agent_install output: {}", &combined[..combined.len().min(500)]));
```

And change this (keeping the tracing but dropping the write_line):

```rust
    match exit_code {
        Some(0) | None => Ok(()),
        Some(code) => {
            tracing::error!("agent_install: exited with code {code}, output: {}", &combined[..combined.len().min(300)]);
            crate::core::logging::write_line("ERROR", "be", &format!("agent_install failed (exit {code}): {}", &combined[..combined.len().min(1000)]));
            Err(format!("Agent install exited with code {code}"))
        }
    }
```

to:

```rust
    let combined = output_lines.join("\n");
    match exit_code {
        Some(0) | None => Ok(()),
        Some(code) => {
            tracing::error!(
                "agent_install: exited with code {code}, output: {}",
                &combined[..combined.len().min(300)]
            );
            Err(format!("Agent install exited with code {code}"))
        }
    }
```

(The `let combined = output_lines.join("\n");` needs to move out of the deleted block so it's still in scope for the `tracing::error!` line below.)

- [ ] **Step 13.3: Build and test**

Run: `cd src-tauri && cargo build 2>&1 | tail -10 && cargo test -p openacp-desktop --lib 2>&1 | tail -10`

Expected: `Finished` and all tests pass.

- [ ] **Step 13.4: Commit**

```bash
git add src-tauri/src/core/onboarding/commands.rs src-tauri/src/core/onboarding/setup.rs
git commit -m "$(cat <<'EOF'
feat(debug): expose shell_env snapshot in Copy Debug Info

Adds shell_env_resolved_via, shell_env_path, and
shell_env_vars_count to get_debug_info output so future
user reports include how shell resolution played out.

Also removes the temporary diagnostic logging from
agent_install (b7ecd3b) now that the underlying env
problem is fixed at the source.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Final verification

- [ ] **Step 14.1: Run all unit tests**

Run: `cd src-tauri && cargo test -p openacp-desktop --lib 2>&1 | tail -20`

Expected: All tests pass (should be 24 tests in `shell_env::tests` plus any existing tests elsewhere).

- [ ] **Step 14.2: Full clippy / build check**

Run: `cd src-tauri && cargo build --release 2>&1 | tail -15`

Expected: `Finished` with no warnings from our new code. Pre-existing warnings (if any) are fine.

- [ ] **Step 14.3: Full git log review**

Run: `git log --oneline develop..HEAD`

Expected output:
```
<hash> feat(debug): expose shell_env snapshot in Copy Debug Info
<hash> refactor(commands): get_node_info uses shell_env cache
<hash> refactor: migrate binary.rs + setup.rs to shell_env cache
<hash> feat: wire up fix_path_env + shell_env::prewarm at startup
<hash> feat(shell_env): resolve_via_marker + resolve_blocking + helpers
<hash> feat(shell_env): clean_env + clean_env_from + tests
<hash> feat(shell_env): from_vars + from_process_env + DENYLIST filtering
<hash> feat(shell_env): ShellEnv::build_path
<hash> feat(shell_env): dedupe_path + tests
<hash> feat(shell_env): extract_marked_env + find_bytes + tests
<hash> feat(shell_env): parse_env_nul + tests
<hash> feat(shell_env): scaffold module with public API stubs
<hash> docs: unified shell env resolution design
```

13 commits total.

- [ ] **Step 14.4: Manual verification**

Hand off to user for the manual verification checklist in the spec. They should:

1. `bun tauri dev` and verify startup logs show `shell_env: resolved via /bin/zsh (NN vars)`
2. Trigger onboarding flow (or use existing setup) — verify `openacp --version` works
3. Copy Debug Info from Settings → About — confirm `shell_env_resolved_via`, `shell_env_path`, `shell_env_vars_count` fields appear
4. (Optional) Temporarily add a broken line to `.zshrc` (e.g. `nonexistent-tool-xyz --completion 2>/dev/null || true`) and confirm onboarding still works
5. (Optional) Launch app with `NODE_OPTIONS="--require /tmp/evil.js" bun tauri dev` — confirm openacp runs successfully and `/tmp/evil.js` is NOT executed (check console logs)

User approves → merge to develop.

---

## Notes on deviations

If during execution you hit a Tauri/Rust API difference from what this plan assumes — most likely around `tauri_plugin_shell::Command::envs` signature or `wait-timeout` crate behavior — adapt inline but note the deviation in the commit message so reviewers see it. Do not silently swap techniques.
