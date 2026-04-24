# Unified Shell Environment Resolution — Design

**Date:** 2026-04-15
**Branch:** `refactor/shell-env`
**Status:** Draft — pending implementation

## Background

Over the past week, five consecutive commits have tried to fix the same class of issue: the Tauri backend cannot reliably locate and spawn the `openacp` CLI on users' machines because GUI apps don't inherit the user's full shell `PATH`, and the CLI's `#!/usr/bin/env node` shebang fails when `node` isn't findable.

```
4aa7fa3 fix: ignore shell exit code when stdout has valid output
b7df771 fix: add node dir to PATH when not co-located with openacp
945af55 fix: pass fallback --dir to agents list for non-interactive mode
9378671 fix: unified PATH building for all openacp commands + force agent install
b7ecd3b fix: add diagnostic logging to agent_install for debugging user failures
```

The existing code spawns interactive/login shells (`zsh -i -c`, `zsh -l -c`) repeatedly across `binary.rs` and `setup.rs`, parsing output with fragile heuristics (`stdout.trim().lines().last()`). Every command that needs the user's PATH re-resolves it from scratch, and each resolution is brittle against noisy `.zshrc` files, broken completions, non-zero exit codes, and missing shells.

## Goals

1. **Resolve the user's shell environment exactly once per app lifetime**, cache it, and use that cache for every subsequent CLI spawn.
2. **Make resolution immune to `.zshrc` noise** — broken completions, errors written to stdout, non-zero exit codes should not defeat env capture.
3. **Make `#!/usr/bin/env node` "just work"** by ensuring the spawn env always contains a PATH where `node` is findable, regardless of where `openacp` was installed from.
4. **Harden env hygiene** — strip injection vectors (`NODE_OPTIONS`, `BASH_ENV`, etc.) from the env passed to the CLI.
5. **Centralize** all shell-env concerns in a single module so future changes happen in one place.

## Non-goals

- Bundling `node` as a Tauri sidecar. Users are expected to have their own Node install.
- A `tauri-plugin-shell-env` reusable crate. This is project-internal for now.
- Per-agent env strategies (à la acepe's `EnvStrategy::{FullInherit, Allowlist}`). OpenACP wraps a single CLI; YAGNI.
- Refactoring unrelated parts of `binary.rs` or `setup.rs` (e.g., the `check_known_locations()` fallback logic stays as-is).

## References

Research across Tauri/Electron apps that solve this class of problem:

- [`tauri-apps/fix-path-env-rs`](https://github.com/tauri-apps/fix-path-env-rs) — Tauri-blessed crate; spawns `$SHELL -ilc env` at startup and mutates `std::env::PATH` process-wide. The foundation.
- [`flazouh/acepe` — `shell_env.rs`](https://github.com/flazouh/acepe/blob/main/packages/desktop/src-tauri/src/shell_env.rs) — Closest architectural match: Tauri wrapping Node-based agent CLIs. `OnceLock` cache, `env -0` parsing, DENYLIST.
- [`microsoft/vscode` — `shellEnv.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/platform/shell/node/shellEnv.ts) — Source of the UUID-marker pattern for noise-immune parsing.
- [`zed-industries/zed` — `node_runtime.rs`](https://github.com/zed-industries/zed/blob/main/crates/node_runtime/src/node_runtime.rs) — Three-tier node resolution + `shell_env_loaded` oneshot signal.
- [`openobserve/kide` — `setup.rs`](https://github.com/openobserve/kide/blob/main/src-tauri/src/environment/setup.rs) — Reference for hardcoded fallback PATH dirs.

## Architecture

A new module `src-tauri/src/core/shell_env.rs` becomes the single source of truth for the user's shell environment. Every other module reads from it and never spawns shells directly.

```
┌─────────────────────────────────────────────────────────┐
│  main.rs → lib.rs::run()                                │
│    1. fix_path_env::fix()   ← mutate std::env::PATH     │
│    2. tracing::init()                                   │
│    3. thread::spawn(shell_env::prewarm)                 │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│  core/shell_env.rs  (NEW)                               │
│    static SNAPSHOT: OnceLock<ShellEnv>                  │
│    prewarm()     → spawn $SHELL -ilc, UUID-mark parse   │
│    snapshot()    → &ShellEnv (blocking fallback)        │
│    path()        → full deduped PATH                    │
│    clean_env()   → HashMap stripped of DENYLIST vars    │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  core/sidecar/binary.rs  (simplified)                   │
│    find_openacp_binary() → uses shell_env::path()       │
│    DELETED: resolve_via_shell,                          │
│             get_login_shell_path, prepend_path          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  core/onboarding/setup.rs  (simplified)                 │
│    build_openacp_path() → prepend bin/node dirs to      │
│                           shell_env::path()             │
│    all spawn sites → use shell_env::clean_env()         │
└─────────────────────────────────────────────────────────┘
```

### Invariants

1. **Shell is spawned at most once** per app lifetime (retries on failure during the same resolve count as one logical attempt).
2. **`fix_path_env::fix()` runs before everything else in `run()`** — before tracing init, before `dirs::home_dir()` lookups, before any async runtime work.
3. **`prewarm()` is non-blocking** — spawned on a dedicated OS thread (not the async runtime) so a slow `.zshrc` never blocks Tauri's async executor.
4. **`snapshot()` is never an error** — on any failure (shell missing, timeout, parse fail) it falls back to `std::env` so callers never get a `Result`.
5. **Windows skips shell resolution entirely** but still runs `fix_path_env::fix()` and caches `std::env` as the snapshot.

## Module Interface

### `core/shell_env.rs`

```rust
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

/// Environment variables that must NEVER be inherited by openacp, regardless
/// of what's in the user's shell. Each is an injection vector or footgun for
/// a Node.js CLI specifically.
const DENYLIST: &[&str] = &[
    // Node injection — openacp is a Node CLI
    "NODE_OPTIONS",        // can --require arbitrary scripts
    "NODE_PATH",           // can hijack module resolution
    // Shell injection — bash/sh -c sources these before running the command
    "BASH_ENV",
    "ENV",
    // npm prefix — if user has this set weirdly, `openacp agents install`
    // writes to the wrong place. Explicit is safer.
    "npm_config_prefix",
    "NPM_CONFIG_PREFIX",   // npm reads both casings
];

#[derive(Debug, Clone)]
pub struct ShellEnv {
    pub vars: HashMap<String, String>,    // full env minus DENYLIST
    pub path: String,                     // pre-deduped PATH with node dirs merged
    pub resolved_via: Option<String>,     // which shell resolved (diagnostic)
}

static SNAPSHOT: OnceLock<ShellEnv> = OnceLock::new();
const TIMEOUT: Duration = Duration::from_secs(5);

pub fn prewarm();
pub fn snapshot() -> &'static ShellEnv;
pub fn path() -> &'static str;
pub fn clean_env(extra_path_prefix: Option<&str>) -> HashMap<String, String>;

/// Dedupe PATH entries while preserving order of first occurrence.
/// Used by both `ShellEnv::build_path` and `setup::build_openacp_path`.
pub fn dedupe_path(path: &str, sep: &str) -> String;

// Internals
fn resolve_blocking() -> ShellEnv;
fn resolve_via_marker(shell: &str, timeout: Duration) -> Option<HashMap<String, String>>;
fn extract_marked_env(stdout: &[u8], marker: &str) -> Option<HashMap<String, String>>;
fn parse_env_nul(bytes: &[u8]) -> Option<HashMap<String, String>>;
fn shell_candidates() -> Vec<String>;  // [$SHELL, /bin/zsh, /bin/bash]
fn run_with_timeout(cmd: Command, timeout: Duration) -> Option<Output>;
fn make_marker() -> String;  // __OPENACP_{pid}_{nanos}_ENV__

impl ShellEnv {
    fn from_vars(vars, resolved_via) -> Self;     // applies DENYLIST + build_path
    fn from_process_env() -> Self;                 // fallback
    fn build_path(shell_path: &str) -> String;     // merge well-known node dirs + dedup
}
```

### UUID-marker resolution

The core trick adapted from VS Code and acepe:

```
$shell -ilc 'printf "<MARK>"; env -0; printf "<MARK>"'
```

**Why it's robust:**

- **Noise immunity**: `.zshrc` can print anything before our script runs. We locate the first `<MARK>`, skip everything before it, and stop at the second `<MARK>`. Whatever `.zshrc` printed (welcome banners, completion warnings, oh-my-zsh auto-update messages) is discarded.
- **Exit code ignored**: We never check `output.status.success()`. If the marked block is present and parses, we trust it. This is what commit `4aa7fa3` discovered the hard way — broken `.zshrc` completions exit non-zero but still run our command correctly.
- **`env -0` vs line-oriented `env`**: `env -0` separates entries with `\0` instead of `\n`. Env values containing newlines (rare but real: multi-line `LS_COLORS`, certificate chains in env vars) parse correctly. The `_SHELL_ENV_DELIMITER_` approach from sindresorhus can't handle newline values.

### Marker generation

No `uuid` crate dependency. Uses `std::process::id()` + `SystemTime::UNIX_EPOCH.elapsed().as_nanos()`:

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

The marker doesn't need cryptographic strength — it only needs to not collide with whatever `.zshrc` writes to stdout. A 19-digit nanosecond timestamp plus PID is overwhelmingly sufficient.

### Well-known node dirs

`ShellEnv::build_path()` takes the shell's `PATH`, appends these dirs if not already present, and dedupes:

- `/usr/local/bin` — official Node installer, older Homebrew
- `/opt/homebrew/bin` — Apple Silicon Homebrew
- `$HOME/.nvm/versions/node/*/bin` — newest nvm version (descending sort)
- `$HOME/.local/share/fnm/node-versions/*/installation/bin` — newest fnm version (Linux)
- `$HOME/Library/Application Support/fnm/node-versions/*/installation/bin` — newest fnm (macOS)

This duplicates some of `binary.rs::check_known_locations()` logic but is cheaper: it runs once, populates a string, and never touches the filesystem again after resolution.

## Consumer Migration

### `lib.rs::run()`

```rust
pub fn run() {
    // MUST be first — mutates std::env::PATH. Later code (tracing init,
    // dirs::home_dir, async runtime) inherits the fixed PATH.
    let _ = fix_path_env::fix();

    tracing_subscriber::fmt()
        .with_env_filter(/* ... */)
        .init();

    core::logging::init();

    // Non-blocking prewarm on a dedicated OS thread (not async runtime).
    std::thread::spawn(|| core::shell_env::prewarm());

    // ... rest of run() unchanged ...
}
```

### `core/sidecar/binary.rs`

Delete:
- `resolve_via_shell()` (entire function)
- `get_login_shell_path()` (entire function)
- `prepend_path()` (dead code, not used anywhere)
- The `bin_dir_for_path()` helper stays — still useful for the `extra_path` tuple.

`find_openacp_binary()` becomes:

```rust
pub fn find_openacp_binary() -> Option<(PathBuf, Option<String>)> {
    // 1. Try `which openacp` with the cached shell PATH
    if let Some(path) = which_openacp() {
        let extra = bin_dir_for_path(&path);
        return Some((path, extra));
    }
    // 2. Platform-specific known locations
    if let Some(path) = check_known_locations() {
        let extra = bin_dir_for_path(&path);
        return Some((path, extra));
    }
    tracing::warn!("find_openacp_binary: openacp not found anywhere");
    None
}

fn which_openacp() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let output = std::process::Command::new("where")
            .arg("openacp")
            .env("PATH", crate::core::shell_env::path())
            .output()
            .ok()?;
        // `where` returns multiple lines; take the first non-empty.
        let stdout = String::from_utf8_lossy(&output.stdout);
        let first = stdout.lines().find(|l| !l.trim().is_empty())?.trim();
        if !first.is_empty() {
            return Some(PathBuf::from(first));
        }
        None
    }
    #[cfg(not(windows))]
    {
        let output = std::process::Command::new("/usr/bin/which")
            .arg("openacp")
            .env("PATH", crate::core::shell_env::path())
            .output()
            .ok()?;
        // Ignore exit code — check stdout. Use last() to skip any noise
        // /usr/bin/which itself won't produce but keeping behaviour stable
        // with existing resolver.
        let stdout = String::from_utf8_lossy(&output.stdout);
        let path = stdout.trim().lines().last().unwrap_or("").trim();
        if path.starts_with('/') {
            Some(PathBuf::from(path))
        } else {
            None
        }
    }
}
```

### `core/onboarding/setup.rs`

`build_openacp_path()` becomes a 10-line wrapper:

```rust
pub fn build_openacp_path(bin: &Path, extra_path: &Option<String>) -> String {
    let base = crate::core::shell_env::path();
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut parts: Vec<String> = Vec::new();

    // Prepend openacp binary dir (if not already in base)
    if let Some(extra) = extra_path {
        parts.push(extra.clone());
    }

    // Prepend co-located node dir (if openacp has one alongside)
    let openacp_dir = bin.parent().unwrap_or(Path::new(""));
    let co_located_node = openacp_dir.join("node");
    if co_located_node.exists() {
        parts.push(openacp_dir.to_string_lossy().to_string());
    }

    parts.push(base.to_string());
    crate::core::shell_env::dedupe_path(&parts.join(sep), sep)
}
```

The "find node via shell" logic in the current version is gone — `shell_env::build_path()` already merged well-known node dirs into the cached PATH once at startup.

`openacp_command()`, `run_setup()`, `agent_install()`:

```rust
// Before:
let mut cmd = tokio::process::Command::new(&bin);
cmd.env("PATH", build_openacp_path(&bin, &extra_path));

// After:
let mut cmd = tokio::process::Command::new(&bin);
cmd.env_clear();
cmd.envs(crate::core::shell_env::clean_env(extra_path.as_deref()));
// (clean_env already sets PATH via build_openacp_path internally)
```

`clean_env()` is responsible for:
1. Starting from the snapshot's `vars` (already DENYLIST-stripped)
2. Overwriting `PATH` with `build_openacp_path(bin, extra_path)` result
3. Returning a `HashMap` the caller can pass to both `tokio::process::Command::envs()` and Tauri's `tauri_plugin_shell::Command::envs()`

### `agent_install()` — `--force` flag

Keep `--force` for now. The reason it was added (commit `9378671`) was "agent detected from different node env" — if the env cleanup here eliminates that scenario, we can drop `--force` in a follow-up after manual verification. Not in this PR.

## Testing

### Automated tests (unit, added in this PR)

In `src-tauri/src/core/shell_env.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_env_nul_handles_multiline_values() {
        let input = b"FOO=bar\0MULTI=line1\nline2\0BAZ=qux\0";
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(env.get("MULTI"), Some(&"line1\nline2".to_string()));
        assert_eq!(env.get("BAZ"), Some(&"qux".to_string()));
    }

    #[test]
    fn parse_env_nul_handles_empty_values() {
        let input = b"EMPTY=\0HAS=value\0";
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.get("EMPTY"), Some(&"".to_string()));
    }

    #[test]
    fn parse_env_nul_skips_entries_without_equals() {
        let input = b"GOOD=yes\0NOEQUALS\0ALSO=ok\0";
        let env = parse_env_nul(input).unwrap();
        assert_eq!(env.len(), 2);
        assert!(env.contains_key("GOOD"));
        assert!(env.contains_key("ALSO"));
    }

    #[test]
    fn marker_extraction_skips_zshrc_noise() {
        let mark = "__TEST_MARK__";
        let stdout = format!(
            "Welcome to zsh!\ncompletion warning: foo\n{mark}FOO=bar\0BAZ=qux\0{mark}tail noise"
        );
        let env = extract_marked_env(stdout.as_bytes(), mark).unwrap();
        assert_eq!(env.get("FOO"), Some(&"bar".to_string()));
        assert_eq!(env.get("BAZ"), Some(&"qux".to_string()));
    }

    #[test]
    fn denylist_strips_vars() {
        let mut vars = HashMap::new();
        vars.insert("PATH".into(), "/usr/bin".into());
        vars.insert("NODE_OPTIONS".into(), "--require evil.js".into());
        vars.insert("BASH_ENV".into(), "/tmp/rc".into());
        vars.insert("HOME".into(), "/home/user".into());
        let env = ShellEnv::from_vars(vars, None);
        assert!(!env.vars.contains_key("NODE_OPTIONS"));
        assert!(!env.vars.contains_key("BASH_ENV"));
        assert!(env.vars.contains_key("HOME"));
        assert!(env.vars.contains_key("PATH"));
    }

    #[test]
    fn build_path_dedupes() {
        let shell_path = "/usr/bin:/usr/local/bin:/usr/bin";
        let built = ShellEnv::build_path(shell_path);
        let count = built.split(':').filter(|p| *p == "/usr/bin").count();
        assert_eq!(count, 1);
    }

    #[test]
    fn build_path_merges_well_known_dirs() {
        let shell_path = "/usr/bin";
        let built = ShellEnv::build_path(shell_path);
        assert!(built.contains("/usr/bin"));
        // well-known dirs should be appended if they exist on disk; use a
        // helper that doesn't filesystem-check for deterministic testing
    }
}
```

No test harness changes required — `cargo test -p openacp-desktop` already works.

### Manual verification checklist

Run before merging to `develop`:

- [ ] **Fresh macOS user (Homebrew node)**: onboarding install + setup + agent install completes end-to-end
- [ ] **macOS user with nvm**: onboarding works without `--force` PATH errors
- [ ] **macOS user with fnm**: onboarding works
- [ ] **User with broken `.zshrc`**: temporarily add `nonexistent-tool --completion 2>/dev/null` to `.zshrc`, verify onboarding still works (this is the `4aa7fa3` regression test)
- [ ] **Malicious env**: set `NODE_OPTIONS='--require /tmp/evil.js'` in user env before launching app; verify `openacp --version` doesn't execute `evil.js` (check logs)
- [ ] **`get_debug_info`**: Copy Debug Info output includes `shell_env.resolved_via`, `shell_env.path`, vars count
- [ ] **App startup latency**: time-to-first-render on cold start, not noticeably slower than current develop (±100ms acceptable)
- [ ] **Windows dev build**: `cargo build` succeeds on Windows target (don't need to run, just compile)
- [ ] **Repeated onboarding**: quit, relaunch, onboarding still detects binary (cache doesn't leak across restarts in a bad way)

### Diagnostic logging

`shell_env::prewarm()` logs on completion:

```
INFO shell_env: resolved via /bin/zsh in 342ms, 87 vars, PATH len 412
```

On failure:

```
WARN shell_env: all shells failed (tried $SHELL=/bin/zsh, /bin/zsh, /bin/bash), falling back to std::env
```

`get_debug_info` command gets a new field `shell_env` in its JSON output:

```json
{
  "shell_env": {
    "resolved_via": "/bin/zsh",
    "path": "/opt/homebrew/bin:/usr/local/bin:...",
    "vars_count": 87
  }
}
```

## Migration Order

Five commits, each standalone buildable and runnable:

**Commit 1 — Foundation**
- Add `fix-path-env = "0.0"` to `Cargo.toml`
- Create `src-tauri/src/core/shell_env.rs` with full interface + unit tests
- Register `mod shell_env` in `src-tauri/src/core/mod.rs`
- Verify: `cargo build` pass, `cargo test` pass

**Commit 2 — Wire up at startup**
- `lib.rs::run()`: call `fix_path_env::fix().ok()` as first line
- `lib.rs::run()`: spawn `std::thread::spawn(|| core::shell_env::prewarm())` after tracing init
- Verify: dev build shows prewarm log on startup

**Commit 3 — Migrate `binary.rs`**
- Delete `resolve_via_shell()`, `get_login_shell_path()`, `prepend_path()`
- Add `which_openacp()` using `shell_env::path()`
- `find_openacp_binary()` uses `which_openacp()` first, `check_known_locations()` second
- Verify: dev onboarding still detects binary on local machine

**Commit 4 — Migrate `setup.rs`**
- Simplify `build_openacp_path()` to use `shell_env::path()` as base
- `openacp_command()`, `run_setup()`, `agent_install()` use `clean_env()` to set full env (not just PATH)
- Verify: full onboarding flow works end-to-end on dev machine

**Commit 5 — Cleanup & diagnostics**
- Remove diagnostic-only logging from `agent_install` (commit `b7ecd3b`)
- Add `shell_env` field to `get_debug_info` output
- Update `Copy Debug Info` frontend to include new field
- Verify: debug info Copy works, new field appears

## Risks & Rollback

**Risk 1: `fix_path_env::fix()` mutation surprises**
Some existing code may cache `std::env::var("PATH")` at a specific point. Since `fix()` is the first line of `run()`, all subsequent code inherits the fixed PATH. Grep audit will verify no module reads PATH before `run()` starts.

**Risk 2: `OnceLock` double-init race**
`OnceLock::get_or_init` is internally synchronized — at most one closure runs. Callers arriving before prewarm finishes will block on the OnceLock, not on a second shell spawn.

**Risk 3: 5s timeout too aggressive**
If a user has a genuinely slow `.zshrc` (e.g., nvm use with network check), 5s may expire. Fallback to `std::env::var("PATH")` is safe — it's what current develop behavior produces anyway, so worst case is "no regression vs today."

**Risk 4: Tauri `tauri_plugin_shell::Command` doesn't support `env_clear`**
Need to verify the plugin API accepts `.envs()` setting full env, not just adding individual vars. If it doesn't, use `env(key, value)` for each entry from `clean_env()`.

**Rollback plan**
The branch is isolated on `refactor/shell-env`. If regression is found post-merge:
1. Revert the merge commit on `develop`
2. If the merge was fast-forward, `git reset --hard <previous-sha>` and force-push `develop` (requires user approval)
3. Cherry-pick just the spec doc if desired to retain the design

## Open Questions

None at spec time. All scope questions (minimal vs full, denylist contents, marker strategy) resolved during brainstorming.
