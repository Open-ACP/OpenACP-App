# In-App Browser Stabilization & PiP — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the existing in-app browser feature and add Picture-in-Picture mode, with proper lifecycle management, smooth resize, modal z-order handling, and mode-switching state preservation.

**Architecture:** Single persistent Tauri child webview reparented between 3 parent windows (main / floating / PiP). Rust-authoritative state machine emits events to React. Modal z-order handled via counter-based overlay lock. Resize uses `auto_resize()` + drag-start/end suppression.

**Tech Stack:** Tauri 2 (`features = ["unstable"]`, already enabled), React 19, Radix UI primitives, `@tauri-apps/api` for `invoke`/`listen`, `tauri-plugin-window-state` (already installed).

**Spec:** `docs/superpowers/specs/2026-04-09-browser-panel-stabilization-design.md`

**No test framework exists** in this project. Replace TDD cycles with manual verification via `pnpm tauri dev` + explicit smoke-test checklists after each task.

---

## Chunk 1: Rust Backend — State Machine & Commands

Rewrites `src-tauri/src/core/browser.rs` with a proper state machine, 6-command API (4 primary + 2 visibility helpers), event emission, history tracking, and `initialization_script` injection. Updates `src-tauri/src/lib.rs` command registration.

### File inventory for this chunk

- **Modify (full rewrite)**: `src-tauri/src/core/browser.rs`
- **Modify**: `src-tauri/src/lib.rs` (lines 85-94: swap command registrations)
- **Modify**: `src-tauri/capabilities/default.json` (verify webview permissions still cover new commands)

### Task 1.1: Define state machine types and store

**Files:**
- Modify: `src-tauri/src/core/browser.rs` (replace entire file contents)

- [ ] **Step 1: Replace the top of `browser.rs` with new imports and types**

Open `src-tauri/src/core/browser.rs` and replace the imports + constants section with:

```rust
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, Url, WebviewUrl,
    WebviewWindowBuilder,
};
use tauri::webview::WebviewBuilder;

const BROWSER_LABEL: &str = "browser-panel";
const FLOAT_LABEL: &str = "browser-float";
const PIP_LABEL: &str = "browser-pip";
const MAIN_LABEL: &str = "main";

/// Which parent window currently hosts the webview.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BrowserMode {
    Docked,
    Floating,
    Pip,
}

/// Bounds for docked mode (logical pixels relative to main window).
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Top-level lifecycle state. Serialized for React consumption.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum BrowserState {
    Idle,
    Opening { url: String, mode: BrowserMode },
    Ready { url: String, mode: BrowserMode },
    Navigating { from: String, to: String, mode: BrowserMode },
    Error { url: String, message: String, mode: BrowserMode },
    Closing,
}

impl BrowserState {
    fn kind(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Opening { .. } => "opening",
            Self::Ready { .. } => "ready",
            Self::Navigating { .. } => "navigating",
            Self::Error { .. } => "error",
            Self::Closing => "closing",
        }
    }
}

/// Rust-side history stack. Source of truth for back/forward UI state.
#[derive(Debug, Default, Clone)]
struct History {
    entries: Vec<String>,
    cursor: usize, // index of current entry; valid only if entries is non-empty
}

impl History {
    fn push(&mut self, url: String) {
        // Truncate forward history on new navigation
        if !self.entries.is_empty() && self.cursor + 1 < self.entries.len() {
            self.entries.truncate(self.cursor + 1);
        }
        // De-dupe consecutive identical URLs (SPA spam)
        if self.entries.last().map(|s| s.as_str()) != Some(url.as_str()) {
            self.entries.push(url);
            self.cursor = self.entries.len() - 1;
        }
    }

    fn can_go_back(&self) -> bool {
        !self.entries.is_empty() && self.cursor > 0
    }

    fn can_go_forward(&self) -> bool {
        !self.entries.is_empty() && self.cursor + 1 < self.entries.len()
    }

    fn go_back(&mut self) -> Option<&str> {
        if self.can_go_back() {
            self.cursor -= 1;
            self.entries.get(self.cursor).map(|s| s.as_str())
        } else {
            None
        }
    }

    fn go_forward(&mut self) -> Option<&str> {
        if self.can_go_forward() {
            self.cursor += 1;
            self.entries.get(self.cursor).map(|s| s.as_str())
        } else {
            None
        }
    }
}

/// Global store managed by tauri::State.
pub struct BrowserStore {
    inner: Mutex<BrowserStoreInner>,
}

struct BrowserStoreInner {
    state: BrowserState,
    history: History,
    /// Incremented every time a modal wants browser hidden; when > 0, webview is suppressed.
    suppress_count: u32,
    /// Last known docked bounds — used to restore when unsuppressing after suppress in docked mode.
    last_docked_bounds: Option<Bounds>,
}

impl BrowserStore {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(BrowserStoreInner {
                state: BrowserState::Idle,
                history: History::default(),
                suppress_count: 0,
                last_docked_bounds: None,
            }),
        }
    }
}

impl Default for BrowserStore {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 2: Verify the file compiles (syntax only at this stage)**

Run: `cd src-tauri && cargo check 2>&1 | head -40`
Expected: errors about missing command functions (the old commands were removed), but no syntax errors in the new type definitions.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/core/browser.rs
git commit -m "feat(browser): add state machine types and store"
```

### Task 1.2: Add event emission helpers

**Files:**
- Modify: `src-tauri/src/core/browser.rs` (append below types)

- [ ] **Step 1: Append event payload types and emit helpers**

Add after the `impl BrowserStore` block:

```rust
// ── Event payloads ──────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
struct StateChangedPayload<'a> {
    state: &'a BrowserState,
    can_go_back: bool,
    can_go_forward: bool,
    suppressed: bool,
}

#[derive(Clone, Serialize)]
struct UrlChangedPayload {
    url: String,
}

#[derive(Clone, Serialize)]
struct NavErrorPayload {
    url: String,
    message: String,
}

const EVT_STATE_CHANGED: &str = "browser://state-changed";
const EVT_URL_CHANGED: &str = "browser://url-changed";
const EVT_NAV_ERROR: &str = "browser://nav-error";
const EVT_PAGE_LOADED: &str = "browser://page-loaded";

/// Emit a `browser://state-changed` event with current derived flags.
fn emit_state(app: &AppHandle, inner: &BrowserStoreInner) {
    let payload = StateChangedPayload {
        state: &inner.state,
        can_go_back: inner.history.can_go_back(),
        can_go_forward: inner.history.can_go_forward(),
        suppressed: inner.suppress_count > 0,
    };
    if let Err(e) = app.emit(EVT_STATE_CHANGED, payload) {
        tracing::warn!("failed to emit browser state: {e}");
    }
}

fn emit_url(app: &AppHandle, url: &str) {
    let _ = app.emit(
        EVT_URL_CHANGED,
        UrlChangedPayload {
            url: url.to_string(),
        },
    );
}

fn emit_nav_error(app: &AppHandle, url: &str, message: &str) {
    let _ = app.emit(
        EVT_NAV_ERROR,
        NavErrorPayload {
            url: url.to_string(),
            message: message.to_string(),
        },
    );
}

fn emit_page_loaded(app: &AppHandle, url: &str) {
    let _ = app.emit(
        EVT_PAGE_LOADED,
        UrlChangedPayload {
            url: url.to_string(),
        },
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/core/browser.rs
git commit -m "feat(browser): add event payloads and emit helpers"
```

### Task 1.3: Add initialization script and navigation-tracking constant

**Files:**
- Modify: `src-tauri/src/core/browser.rs`

- [ ] **Step 1: Append the injected JS init script**

Add below the event helpers:

```rust
/// JS injected into every page — hooks history/SPA navigation, error events,
/// and forwards to the Tauri event bus via the `window.__TAURI__` IPC.
const INIT_SCRIPT: &str = r#"
(function() {
  if (window.__openacpBrowserHooked) return;
  window.__openacpBrowserHooked = true;

  function post(name, payload) {
    try {
      if (window.__TAURI_INTERNALS__) {
        window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
          event: name,
          payload: JSON.stringify(payload),
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // Track SPA navigation via pushState/replaceState/popstate/hashchange
  function notifyUrl() {
    post('browser-nav-internal', { url: location.href });
  }
  var origPush = history.pushState;
  history.pushState = function() {
    var r = origPush.apply(this, arguments);
    notifyUrl();
    return r;
  };
  var origReplace = history.replaceState;
  history.replaceState = function() {
    var r = origReplace.apply(this, arguments);
    notifyUrl();
    return r;
  };
  window.addEventListener('popstate', notifyUrl);
  window.addEventListener('hashchange', notifyUrl);

  // Forward uncaught errors
  window.addEventListener('error', function(e) {
    post('browser-page-error', {
      url: location.href,
      message: (e && e.message) || 'Unknown error',
    });
  });
  window.addEventListener('unhandledrejection', function(e) {
    post('browser-page-error', {
      url: location.href,
      message: 'Unhandled rejection: ' + (e && e.reason && e.reason.toString ? e.reason.toString() : String(e && e.reason)),
    });
  });

  // Alive heartbeat — parent can poll via eval
  window.__browserAlive = true;
})();
"#;
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/core/browser.rs
git commit -m "feat(browser): add initialization script for SPA nav tracking"
```

### Task 1.4: Implement webview creation helper

**Files:**
- Modify: `src-tauri/src/core/browser.rs`

- [ ] **Step 1: Add `create_webview_in_main` helper**

Append to `browser.rs`:

```rust
// ── Helpers ─────────────────────────────────────────────────────────────────

fn parse_url(url: &str) -> Result<Url, String> {
    url.parse::<Url>().map_err(|e| format!("invalid URL: {e}"))
}

/// Create the persistent webview as a child of the main window.
/// Called only on first open or after a full close.
fn create_child_in_main(app: &AppHandle, url: &str, bounds: Bounds) -> Result<(), String> {
    let window = app
        .get_window(MAIN_LABEL)
        .ok_or("main window not found")?;

    let parsed = parse_url(url)?;
    let app_for_nav = app.clone();
    let app_for_load = app.clone();

    let builder = WebviewBuilder::new(BROWSER_LABEL, WebviewUrl::External(parsed))
        .initialization_script(INIT_SCRIPT)
        .auto_resize()
        .on_navigation(move |url| {
            // Track Rust-side history on top-level navigation.
            // NOTE: on_navigation fires before the URL loads; we cannot
            // distinguish programmatic vs user-click here — we push regardless
            // and de-dupe in History::push.
            if let Some(store) = app_for_nav.try_state::<BrowserStore>() {
                if let Ok(mut inner) = store.inner.lock() {
                    inner.history.push(url.to_string());
                    emit_state(&app_for_nav, &inner);
                }
            }
            emit_url(&app_for_nav, url.as_str());
            true // allow
        });

    window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(|e| format!("add_child failed: {e}"))?;

    // Listen to page-load events on the freshly created webview.
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        let wv_app = app_for_load.clone();
        wv.on_page_load(move |wv, payload| {
            use tauri::webview::PageLoadEvent;
            if matches!(payload.event(), PageLoadEvent::Finished) {
                emit_page_loaded(&wv_app, payload.url().as_str());
            }
        });
    }

    Ok(())
}

/// Ensure float window exists, return its handle.
fn ensure_float_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(FLOAT_LABEL) {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, FLOAT_LABEL, WebviewUrl::App("about:blank".into()))
        .title("OpenACP Browser")
        .inner_size(800.0, 600.0)
        .min_inner_size(400.0, 300.0)
        .resizable(true)
        .decorations(true)
        .always_on_top(false)
        .visible(false)
        .build()
        .map_err(|e| format!("float window build failed: {e}"))
}

/// Ensure PiP window exists, return its handle.
fn ensure_pip_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(PIP_LABEL) {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, PIP_LABEL, WebviewUrl::App("about:blank".into()))
        .title("Browser (PiP)")
        .inner_size(380.0, 240.0)
        .min_inner_size(280.0, 180.0)
        .max_inner_size(800.0, 600.0)
        .resizable(true)
        .decorations(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| format!("pip window build failed: {e}"))
}

fn close_window_if_exists(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.close();
    }
}
```

- [ ] **Step 2: Run cargo check**

Run: `cd src-tauri && cargo check 2>&1 | tail -30`
Expected: compile errors about missing `#[tauri::command]` functions (old ones removed), but no errors inside helpers. Fix any syntax issues reported.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/core/browser.rs
git commit -m "feat(browser): add webview creation and window ensure helpers"
```

### Task 1.5: Implement `browser_show` command (create or navigate)

**Files:**
- Modify: `src-tauri/src/core/browser.rs`

- [ ] **Step 1: Add `ShowOptions` + `browser_show` command**

Append:

```rust
// ── Commands ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ShowOptions {
    pub url: String,
    pub mode: BrowserMode,
    pub bounds: Option<Bounds>,
}

/// Create the webview (if needed) and reparent to the target mode's window.
/// If the webview already exists, navigate to the new URL and switch mode.
#[tauri::command]
pub async fn browser_show(
    app: AppHandle,
    store: State<'_, BrowserStore>,
    opts: ShowOptions,
) -> Result<(), String> {
    // Transition to Opening
    {
        let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
        inner.state = BrowserState::Opening {
            url: opts.url.clone(),
            mode: opts.mode,
        };
        if opts.mode == BrowserMode::Docked {
            if let Some(b) = opts.bounds {
                inner.last_docked_bounds = Some(b);
            }
        }
        emit_state(&app, &inner);
    }

    // Create webview if it doesn't exist
    if app.get_webview(BROWSER_LABEL).is_none() {
        let bounds = opts.bounds.unwrap_or(Bounds {
            x: 0.0,
            y: 0.0,
            width: 480.0,
            height: 600.0,
        });
        create_child_in_main(&app, &opts.url, bounds)?;
    } else {
        // Navigate existing webview to new URL
        if let Some(wv) = app.get_webview(BROWSER_LABEL) {
            let parsed = parse_url(&opts.url)?;
            wv.navigate(parsed).map_err(|e| e.to_string())?;
        }
    }

    // Reparent to target mode's window
    reparent_to_mode(&app, opts.mode, opts.bounds)?;

    // Transition to Ready
    {
        let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
        inner.state = BrowserState::Ready {
            url: opts.url,
            mode: opts.mode,
        };
        emit_state(&app, &inner);
    }

    Ok(())
}

/// Reparent the webview to the window matching `mode`. Creates target window if needed.
fn reparent_to_mode(
    app: &AppHandle,
    mode: BrowserMode,
    bounds: Option<Bounds>,
) -> Result<(), String> {
    let wv = app
        .get_webview(BROWSER_LABEL)
        .ok_or("webview not created")?;

    match mode {
        BrowserMode::Docked => {
            let main = app.get_window(MAIN_LABEL).ok_or("main window not found")?;
            wv.reparent(&main).map_err(|e| e.to_string())?;
            if let Some(b) = bounds {
                wv.set_position(tauri::Position::Logical(LogicalPosition::new(b.x, b.y)))
                    .map_err(|e| e.to_string())?;
                wv.set_size(tauri::Size::Logical(LogicalSize::new(b.width, b.height)))
                    .map_err(|e| e.to_string())?;
            }
            // Hide sibling windows
            close_window_if_exists(app, FLOAT_LABEL);
            close_window_if_exists(app, PIP_LABEL);
        }
        BrowserMode::Floating => {
            let float = ensure_float_window(app)?;
            wv.reparent(&float).map_err(|e| e.to_string())?;
            float.show().map_err(|e| e.to_string())?;
            close_window_if_exists(app, PIP_LABEL);
        }
        BrowserMode::Pip => {
            let pip = ensure_pip_window(app)?;
            wv.reparent(&pip).map_err(|e| e.to_string())?;
            pip.show().map_err(|e| e.to_string())?;
            close_window_if_exists(app, FLOAT_LABEL);
        }
    }
    Ok(())
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/core/browser.rs
git commit -m "feat(browser): add browser_show command with mode reparenting"
```

### Task 1.6: Implement remaining commands (navigate, set_mode, close, suppress)

**Files:**
- Modify: `src-tauri/src/core/browser.rs`

- [ ] **Step 1: Append navigate/set_mode/close/suppress commands**

```rust
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum NavAction {
    Url { url: String },
    Back,
    Forward,
    Reload,
}

#[tauri::command]
pub async fn browser_navigate(
    app: AppHandle,
    store: State<'_, BrowserStore>,
    action: NavAction,
) -> Result<(), String> {
    let wv = app
        .get_webview(BROWSER_LABEL)
        .ok_or("browser webview not found")?;

    match action {
        NavAction::Url { url } => {
            let parsed = parse_url(&url)?;
            wv.navigate(parsed).map_err(|e| e.to_string())?;
        }
        NavAction::Back => {
            let target = {
                let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
                inner.history.go_back().map(|s| s.to_string())
            };
            if let Some(target) = target {
                let parsed = parse_url(&target)?;
                wv.navigate(parsed).map_err(|e| e.to_string())?;
                let inner = store.inner.lock().map_err(|e| e.to_string())?;
                emit_state(&app, &inner);
                emit_url(&app, &target);
            }
        }
        NavAction::Forward => {
            let target = {
                let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
                inner.history.go_forward().map(|s| s.to_string())
            };
            if let Some(target) = target {
                let parsed = parse_url(&target)?;
                wv.navigate(parsed).map_err(|e| e.to_string())?;
                let inner = store.inner.lock().map_err(|e| e.to_string())?;
                emit_state(&app, &inner);
                emit_url(&app, &target);
            }
        }
        NavAction::Reload => {
            wv.eval("location.reload()").map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_set_mode(
    app: AppHandle,
    store: State<'_, BrowserStore>,
    mode: BrowserMode,
    bounds: Option<Bounds>,
) -> Result<(), String> {
    reparent_to_mode(&app, mode, bounds)?;
    let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
    if let Some(b) = bounds {
        if mode == BrowserMode::Docked {
            inner.last_docked_bounds = Some(b);
        }
    }
    // Update mode in state (preserve current URL)
    let current_url = match &inner.state {
        BrowserState::Ready { url, .. }
        | BrowserState::Opening { url, .. }
        | BrowserState::Navigating { to: url, .. }
        | BrowserState::Error { url, .. } => url.clone(),
        _ => String::new(),
    };
    if !current_url.is_empty() {
        inner.state = BrowserState::Ready {
            url: current_url,
            mode,
        };
    }
    emit_state(&app, &inner);
    Ok(())
}

#[tauri::command]
pub async fn browser_close(
    app: AppHandle,
    store: State<'_, BrowserStore>,
) -> Result<(), String> {
    {
        let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
        inner.state = BrowserState::Closing;
        emit_state(&app, &inner);
    }
    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        let _ = wv.close();
    }
    close_window_if_exists(&app, FLOAT_LABEL);
    close_window_if_exists(&app, PIP_LABEL);
    {
        let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
        inner.state = BrowserState::Idle;
        inner.history = History::default();
        inner.suppress_count = 0;
        inner.last_docked_bounds = None;
        emit_state(&app, &inner);
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_suppress(
    app: AppHandle,
    store: State<'_, BrowserStore>,
) -> Result<(), String> {
    let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
    inner.suppress_count = inner.suppress_count.saturating_add(1);
    if inner.suppress_count == 1 {
        if let Some(wv) = app.get_webview(BROWSER_LABEL) {
            let _ = wv.hide();
        }
    }
    emit_state(&app, &inner);
    Ok(())
}

#[tauri::command]
pub async fn browser_unsuppress(
    app: AppHandle,
    store: State<'_, BrowserStore>,
) -> Result<(), String> {
    let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
    inner.suppress_count = inner.suppress_count.saturating_sub(1);
    if inner.suppress_count == 0 {
        if let Some(wv) = app.get_webview(BROWSER_LABEL) {
            let _ = wv.show();
            // Re-sync docked bounds in case layout shifted while hidden
            if let Some(b) = inner.last_docked_bounds {
                let _ = wv.set_position(tauri::Position::Logical(LogicalPosition::new(b.x, b.y)));
                let _ = wv.set_size(tauri::Size::Logical(LogicalSize::new(b.width, b.height)));
            }
        }
    }
    emit_state(&app, &inner);
    Ok(())
}

#[tauri::command]
pub async fn browser_reset_suppress(
    _app: AppHandle,
    store: State<'_, BrowserStore>,
) -> Result<(), String> {
    let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
    inner.suppress_count = 0;
    Ok(())
}
```

- [ ] **Step 2: Run cargo check**

Run: `cd src-tauri && cargo check 2>&1 | tail -40`
Expected: no errors related to browser.rs itself; may have errors in `lib.rs` about missing old commands (fix in Task 1.7).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/core/browser.rs
git commit -m "feat(browser): add navigate/set_mode/close/suppress commands"
```

### Task 1.7: Update `lib.rs` command registration and manage `BrowserStore`

**Files:**
- Modify: `src-tauri/src/lib.rs` (lines 85-94 for commands; setup block for manage)

- [ ] **Step 1: Replace browser command list**

Open `src-tauri/src/lib.rs` and replace lines 85-94 (the `// Browser panel commands` section) with:

```rust
            // Browser panel commands
            core::browser::browser_show,
            core::browser::browser_navigate,
            core::browser::browser_set_mode,
            core::browser::browser_close,
            core::browser::browser_suppress,
            core::browser::browser_unsuppress,
            core::browser::browser_reset_suppress,
```

- [ ] **Step 2: Register `BrowserStore` in the `.setup` block**

Find the `.setup(move |app| {` block (around line 97) and add inside it, after the existing `app.manage(AppState { ... })`:

```rust
            app.manage(core::browser::BrowserStore::new());
```

- [ ] **Step 3: Run full cargo check**

Run: `cd src-tauri && cargo check 2>&1 | tail -30`
Expected: clean compile (maybe warnings about unused imports).

- [ ] **Step 4: Run `pnpm tauri dev` smoke test**

Run: `pnpm tauri dev` in a separate terminal.
Expected: app launches successfully. Browser feature is disabled in settings by default; existing app functionality unaffected.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(browser): register new commands and BrowserStore state"
```

### Task 1.8: Verify capabilities still cover new commands

**Files:**
- Modify: `src-tauri/capabilities/default.json` (if needed)

- [ ] **Step 1: Inspect current capabilities for webview permissions**

Run: `cat src-tauri/capabilities/default.json`
Expected: should already include `core:webview:allow-create-webview`, `allow-webview-close`, `allow-webview-show`, `allow-webview-hide`, `allow-set-webview-position`, `allow-set-webview-size`. If `reparent` or `navigate` permissions are separate, add them.

- [ ] **Step 2: If any permissions missing, add them**

Required additions (if not present):
- `core:webview:allow-reparent`
- `core:webview:allow-webview-navigate`
- `core:window:allow-create`

Use the Tauri docs for exact names: https://v2.tauri.app/reference/acl/

- [ ] **Step 3: Commit (only if file was modified)**

```bash
git add src-tauri/capabilities/default.json
git commit -m "feat(browser): add capabilities for reparent and navigate"
```

---


## Chunk 2: React Context Layer

Creates `BrowserPanelContext` (subscribes to Rust events, exposes typed actions) and `BrowserOverlayContext` (counter-based modal lock). Wires them into `app.tsx` root.

### File inventory for this chunk

- **Create**: `src/openacp/context/browser-panel.tsx`
- **Create**: `src/openacp/context/browser-overlay.tsx`
- **Modify**: `src/openacp/app.tsx` (wrap providers; simplify browser state; delete old browser* useStates)

### Task 2.1: Create `browser-panel` context

**Files:**
- Create: `src/openacp/context/browser-panel.tsx`

- [ ] **Step 1: Write the full context file**

Create `src/openacp/context/browser-panel.tsx`:

```tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

export type BrowserMode = "docked" | "floating" | "pip"

export type BrowserStateKind =
  | "idle"
  | "opening"
  | "ready"
  | "navigating"
  | "error"
  | "closing"

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserStateChangedPayload {
  state: {
    kind: BrowserStateKind
    url?: string
    mode?: BrowserMode
    message?: string
    from?: string
    to?: string
  }
  can_go_back: boolean
  can_go_forward: boolean
  suppressed: boolean
}

interface State {
  kind: BrowserStateKind
  url: string | null
  mode: BrowserMode
  canGoBack: boolean
  canGoForward: boolean
  suppressed: boolean
  error: string | null
  isVisible: boolean
}

const initial: State = {
  kind: "idle",
  url: null,
  mode: "docked",
  canGoBack: false,
  canGoForward: false,
  suppressed: false,
  error: null,
  isVisible: false,
}

type Action =
  | { type: "state-changed"; payload: BrowserStateChangedPayload }
  | { type: "url-changed"; url: string }
  | { type: "nav-error"; url: string; message: string }
  | { type: "set-visible"; value: boolean }
  | { type: "clear-error" }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "state-changed": {
      const s = action.payload.state
      return {
        ...state,
        kind: s.kind,
        url: s.url ?? state.url,
        mode: s.mode ?? state.mode,
        canGoBack: action.payload.can_go_back,
        canGoForward: action.payload.can_go_forward,
        suppressed: action.payload.suppressed,
        error: s.kind === "error" ? s.message ?? "Unknown error" : null,
      }
    }
    case "url-changed":
      return { ...state, url: action.url }
    case "nav-error":
      return { ...state, error: action.message, kind: "error" }
    case "set-visible":
      return { ...state, isVisible: action.value }
    case "clear-error":
      return { ...state, error: null }
    default:
      return state
  }
}

export interface BrowserPanelContextValue extends State {
  open: (url: string, bounds?: BrowserBounds, mode?: BrowserMode) => Promise<void>
  close: () => Promise<void>
  setMode: (mode: BrowserMode, bounds?: BrowserBounds) => Promise<void>
  navigate: (url: string) => Promise<void>
  back: () => Promise<void>
  forward: () => Promise<void>
  reload: () => Promise<void>
  show: () => void
  hide: () => void
  clearError: () => void
}

const Ctx = createContext<BrowserPanelContextValue | null>(null)

export function BrowserPanelProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const unlistenersRef = useRef<UnlistenFn[]>([])

  useEffect(() => {
    let active = true
    async function wire() {
      const u1 = await listen<BrowserStateChangedPayload>(
        "browser://state-changed",
        (e) => {
          if (!active) return
          dispatch({ type: "state-changed", payload: e.payload })
        },
      )
      const u2 = await listen<{ url: string }>("browser://url-changed", (e) => {
        if (!active) return
        dispatch({ type: "url-changed", url: e.payload.url })
      })
      const u3 = await listen<{ url: string; message: string }>(
        "browser://nav-error",
        (e) => {
          if (!active) return
          dispatch({
            type: "nav-error",
            url: e.payload.url,
            message: e.payload.message,
          })
        },
      )
      unlistenersRef.current = [u1, u2, u3]
    }
    void wire()
    return () => {
      active = false
      unlistenersRef.current.forEach((u) => u())
      unlistenersRef.current = []
    }
  }, [])

  const open = useCallback(
    async (url: string, bounds?: BrowserBounds, mode: BrowserMode = "docked") => {
      dispatch({ type: "set-visible", value: true })
      dispatch({ type: "clear-error" })
      await invoke("browser_show", { opts: { url, mode, bounds: bounds ?? null } })
    },
    [],
  )

  const close = useCallback(async () => {
    dispatch({ type: "set-visible", value: false })
    await invoke("browser_close")
  }, [])

  const setMode = useCallback(
    async (mode: BrowserMode, bounds?: BrowserBounds) => {
      await invoke("browser_set_mode", { mode, bounds: bounds ?? null })
    },
    [],
  )

  const navigate = useCallback(async (url: string) => {
    dispatch({ type: "clear-error" })
    await invoke("browser_navigate", { action: { type: "url", url } })
  }, [])

  const back = useCallback(async () => {
    await invoke("browser_navigate", { action: { type: "back" } })
  }, [])

  const forward = useCallback(async () => {
    await invoke("browser_navigate", { action: { type: "forward" } })
  }, [])

  const reload = useCallback(async () => {
    await invoke("browser_navigate", { action: { type: "reload" } })
  }, [])

  const show = useCallback(() => dispatch({ type: "set-visible", value: true }), [])
  const hide = useCallback(() => dispatch({ type: "set-visible", value: false }), [])
  const clearError = useCallback(() => dispatch({ type: "clear-error" }), [])

  const value = useMemo<BrowserPanelContextValue>(
    () => ({
      ...state,
      open,
      close,
      setMode,
      navigate,
      back,
      forward,
      reload,
      show,
      hide,
      clearError,
    }),
    [state, open, close, setMode, navigate, back, forward, reload, show, hide, clearError],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useBrowserPanel(): BrowserPanelContextValue {
  const v = useContext(Ctx)
  if (!v) throw new Error("useBrowserPanel must be used within BrowserPanelProvider")
  return v
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: no errors in the new file. May have errors elsewhere from Task 2.3 onwards.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/context/browser-panel.tsx
git commit -m "feat(browser): add BrowserPanelContext with event subscriptions"
```

### Task 2.2: Create `browser-overlay` context

**Files:**
- Create: `src/openacp/context/browser-overlay.tsx`

- [ ] **Step 1: Write the context**

```tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"
import { invoke } from "@tauri-apps/api/core"

interface BrowserOverlayContextValue {
  acquire: () => void
  release: () => void
}

const Ctx = createContext<BrowserOverlayContextValue | null>(null)

/**
 * Counter-based lock. When count transitions 0 → 1, the browser webview is hidden
 * via `browser_suppress`. When it transitions back to 0, `browser_unsuppress` is called.
 * Used to work around Tauri's fundamental z-order limitation: native child webviews
 * cannot be composited below HTML overlays (modals, popovers, etc.).
 */
export function BrowserOverlayProvider({ children }: { children: React.ReactNode }) {
  const countRef = useRef(0)

  const acquire = useCallback(() => {
    countRef.current += 1
    if (countRef.current === 1) {
      invoke("browser_suppress").catch(() => {})
    }
  }, [])

  const release = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1)
    if (countRef.current === 0) {
      invoke("browser_unsuppress").catch(() => {})
    }
  }, [])

  const value = useMemo(() => ({ acquire, release }), [acquire, release])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function useBrowserOverlayCtx(): BrowserOverlayContextValue {
  const v = useContext(Ctx)
  if (!v) {
    // No-op fallback so wrapped Radix primitives work outside of the provider (e.g. in tests).
    return { acquire: () => {}, release: () => {} }
  }
  return v
}

/**
 * Acquires a browser overlay lock when `active` is true, releases on cleanup.
 * Use inside shadcn wrapper components around Radix primitives that visually
 * overlap the browser panel area.
 */
export function useBrowserOverlayLock(active: boolean): void {
  const { acquire, release } = useBrowserOverlayCtx()
  useEffect(() => {
    if (!active) return
    acquire()
    return () => release()
  }, [active, acquire, release])
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add src/openacp/context/browser-overlay.tsx
git commit -m "feat(browser): add BrowserOverlayContext for modal z-order lock"
```

### Task 2.3: Wire providers into `app.tsx` and simplify browser state

**Files:**
- Modify: `src/openacp/app.tsx`

- [ ] **Step 1: Import the new providers at the top of `app.tsx`**

Add to imports:

```tsx
import { BrowserPanelProvider, useBrowserPanel } from "./context/browser-panel"
import { BrowserOverlayProvider } from "./context/browser-overlay"
```

- [ ] **Step 2: Wrap the app root with the providers**

Find `OpenACPApp` function's return statement (or wherever `AppInterface` is mounted). Wrap the top-level tree like:

```tsx
return (
  <BrowserOverlayProvider>
    <BrowserPanelProvider>
      {/* existing tree */}
    </BrowserPanelProvider>
  </BrowserOverlayProvider>
)
```

- [ ] **Step 3: Delete old browser state and handlers from `AppInterface`**

Remove from around line 571-610:
- `const [browserOpen, setBrowserOpen] = useState(false)`
- `const [browserUrl, setBrowserUrl] = useState<string | null>(null)`
- `const [browserPanelEnabled, setBrowserPanelEnabled] = useState(false)` — KEEP this one (still controls feature flag)
- The `handleOpenInBrowser` useEffect — replace to call `useBrowserPanel().open(url)`

Replace the useEffect block at lines 596-610 with:

```tsx
const browser = useBrowserPanel()

// Listen for open-in-browser events (from link interceptor)
useEffect(() => {
  function handleOpenInBrowser(e: Event) {
    const { url } = (e as CustomEvent).detail
    if (!url) return
    if (browserPanelEnabled) {
      void browser.open(url)
    } else {
      import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl(url))
        .catch(console.error)
    }
  }
  window.addEventListener("open-in-browser-panel", handleOpenInBrowser)
  return () => window.removeEventListener("open-in-browser-panel", handleOpenInBrowser)
}, [browserPanelEnabled, browser])
```

- [ ] **Step 4: Replace `browserOpen` references in render**

Find the `<Titlebar ... browserOpen={browserOpen} ... onToggleBrowser={() => setBrowserOpen((v) => !v)} ... />` and the `<AnimatePresence>{browserOpen && ...}</AnimatePresence>` block.

Replace with:
- `browserOpen={browser.isVisible}`
- `onToggleBrowser={() => (browser.isVisible ? void browser.close() : void browser.open(browser.url ?? "about:blank"))}`
- `{browser.isVisible && ...}` (in the AnimatePresence)

Note: the `<BrowserPanel>` component will be rewritten in Chunk 4; its props will change then. For now keep the old props working by passing `url={browser.url}` `onClose={() => void browser.close()}`.

- [ ] **Step 5: Run typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -30`
Expected: clean. Fix any prop mismatches.

- [ ] **Step 6: Smoke test**

Run: `pnpm tauri dev`
Expected: app boots. Toggling browser via titlebar still works (opens empty panel since no URL yet — this is fine for this task).

- [ ] **Step 7: Commit**

```bash
git add src/openacp/app.tsx
git commit -m "refactor(app): wire BrowserPanel/Overlay providers and context actions"
```

---

## Chunk 3: Modal Overlay Integration

Wraps each Radix/shadcn primitive that can visually overlap the browser panel with `useBrowserOverlayLock`. Each wrapped primitive acquires a lock when its `open` state is true; the browser is hidden while any lock is held.

### File inventory for this chunk

- **Modify**: `src/openacp/components/ui/dialog.tsx`
- **Modify**: `src/openacp/components/ui/sheet.tsx`
- **Modify**: `src/openacp/components/ui/popover.tsx`
- **Modify**: `src/openacp/components/ui/dropdown-menu.tsx`
- **Modify**: `src/openacp/components/ui/tooltip.tsx`
- **Audit / modify as needed**: `src/openacp/components/command-palette.tsx` and any custom `fixed`-positioned modal in `src/openacp/components/`

### Task 3.1: Wrap Dialog with overlay lock

**Files:**
- Modify: `src/openacp/components/ui/dialog.tsx`

- [ ] **Step 1: Import `useBrowserOverlayLock` and create a tracker hook**

Add at the top of `dialog.tsx`:

```tsx
import { useBrowserOverlayLock } from "../../context/browser-overlay"
```

- [ ] **Step 2: Replace the `Dialog` function to track open state**

Replace lines 8-12 (the `Dialog` function) with:

```tsx
function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const isControlled = open !== undefined
  const currentOpen = isControlled ? open : internalOpen

  useBrowserOverlayLock(!!currentOpen)

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )

  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      {...props}
    />
  )
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: clean.

- [ ] **Step 4: Smoke test**

Run: `pnpm tauri dev`. Open Settings (which uses Dialog). Browser panel should still work. No visual regression on modal.
Note: without a browser webview open, no suppress/unsuppress is visible — that's tested in Chunk 5.

- [ ] **Step 5: Commit**

```bash
git add src/openacp/components/ui/dialog.tsx
git commit -m "feat(ui): Dialog acquires browser overlay lock when open"
```

### Task 3.2: Wrap Sheet with overlay lock

**Files:**
- Modify: `src/openacp/components/ui/sheet.tsx`

- [ ] **Step 1: Apply the same pattern**

Find the `Sheet` function wrapping `SheetPrimitive.Root` and replicate the Dialog pattern: track open state (controlled or uncontrolled), call `useBrowserOverlayLock(currentOpen)`.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec tsc --noEmit 2>&1 | tail -5
git add src/openacp/components/ui/sheet.tsx
git commit -m "feat(ui): Sheet acquires browser overlay lock when open"
```

### Task 3.3: Wrap Popover with overlay lock

**Files:**
- Modify: `src/openacp/components/ui/popover.tsx`

- [ ] **Step 1: Apply the same pattern to the `Popover` root wrapper**

Same controlled/uncontrolled open tracking + `useBrowserOverlayLock`.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec tsc --noEmit 2>&1 | tail -5
git add src/openacp/components/ui/popover.tsx
git commit -m "feat(ui): Popover acquires browser overlay lock when open"
```

### Task 3.4: Wrap DropdownMenu with overlay lock

**Files:**
- Modify: `src/openacp/components/ui/dropdown-menu.tsx`

- [ ] **Step 1: Apply the same pattern to `DropdownMenu` root**

Same as above.

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec tsc --noEmit 2>&1 | tail -5
git add src/openacp/components/ui/dropdown-menu.tsx
git commit -m "feat(ui): DropdownMenu acquires browser overlay lock when open"
```

### Task 3.5: Wrap Tooltip with opt-out flag

**Files:**
- Modify: `src/openacp/components/ui/tooltip.tsx`

- [ ] **Step 1: Add a `suppressBrowser` prop defaulting to false**

Most tooltips are small and don't overlap the browser area. Hide-on-tooltip would thrash the webview. Add an opt-in prop: tooltips that sit over the browser panel set `suppressBrowser={true}`.

```tsx
function Tooltip({
  suppressBrowser = false,
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & {
  suppressBrowser?: boolean
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const isControlled = open !== undefined
  const currentOpen = isControlled ? open : internalOpen

  useBrowserOverlayLock(suppressBrowser && !!currentOpen)

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange],
  )
  return (
    <TooltipPrimitive.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      {...props}
    />
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
pnpm exec tsc --noEmit 2>&1 | tail -5
git add src/openacp/components/ui/tooltip.tsx
git commit -m "feat(ui): Tooltip supports optional browser overlay lock"
```

### Task 3.6: Audit custom modals and CommandPalette

**Files:**
- Review: `src/openacp/components/command-palette.tsx`
- Review: any component using raw `fixed inset-0` positioning

- [ ] **Step 1: Grep for raw fixed-position modals**

Run: `grep -rn "fixed inset-0" src/openacp/components --include="*.tsx"`
Review each match. If any component renders a full-screen modal that isn't built on top of Dialog/Sheet/Popover, it needs manual integration.

- [ ] **Step 2: If CommandPalette uses `Dialog` internally, no change needed**

Otherwise add a `useBrowserOverlayLock(isOpen)` call inside it.

- [ ] **Step 3: Document findings and commit**

```bash
git add -A
git commit -m "feat(ui): audit custom modals for browser overlay lock" --allow-empty
```

---

## Chunk 4: Browser Panel UI Rewrite

Rewrites `browser-panel.tsx` to consume `useBrowserPanel()` context, removes the manual `ResizeObserver` + `syncBounds` logic, adds proper error state UI and mode selector dropdown. Also extends `ResizeHandle` with `onResizeStart`/`onResizeEnd` callbacks for drag-start suppression.

### File inventory for this chunk

- **Modify**: `src/openacp/components/ui/resize-handle.tsx` (add onResizeStart/End)
- **Modify (full rewrite)**: `src/openacp/components/browser-panel.tsx`
- **Modify**: `src/openacp/app.tsx` (update BrowserPanel render props to match new API)

### Task 4.1: Extend ResizeHandle with start/end callbacks

**Files:**
- Modify: `src/openacp/components/ui/resize-handle.tsx`

- [ ] **Step 1: Add `onResizeStart` and `onResizeEnd` to the props interface**

```tsx
export interface ResizeHandleProps {
  direction: "horizontal" | "vertical"
  edge?: "start" | "end"
  size: number
  min: number
  max: number
  onResize: (size: number) => void
  onResizeStart?: () => void
  onResizeEnd?: (finalSize: number) => void
  onCollapse?: () => void
  collapseThreshold?: number
  className?: string
}
```

- [ ] **Step 2: Call them in `handleMouseDown`**

Inside the existing `handleMouseDown` callback, fire `onResizeStart?.()` before attaching listeners. Fire `onResizeEnd?.(current)` inside `onMouseUp` before the collapse check.

```tsx
const handleMouseDown = useCallback(
  (e: React.MouseEvent) => {
    e.preventDefault()
    const start = direction === "horizontal" ? e.clientX : e.clientY
    const startSize = size
    let current = startSize

    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"
    onResizeStart?.()

    const onMouseMove = (moveEvent: MouseEvent) => {
      const pos = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
      const delta =
        direction === "vertical"
          ? resolvedEdge === "end"
            ? pos - start
            : start - pos
          : resolvedEdge === "start"
            ? start - pos
            : pos - start
      current = startSize + delta
      const clamped = Math.min(max, Math.max(min, current))
      onResize(clamped)
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ""
      document.body.style.overflow = ""
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)

      const clamped = Math.min(max, Math.max(min, current))
      onResizeEnd?.(clamped)

      const threshold = collapseThreshold ?? 0
      if (onCollapse && threshold > 0 && current < threshold) {
        onCollapse()
      }
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  },
  [direction, resolvedEdge, size, min, max, onResize, onResizeStart, onResizeEnd, onCollapse, collapseThreshold],
)
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm exec tsc --noEmit 2>&1 | tail -5
git add src/openacp/components/ui/resize-handle.tsx
git commit -m "feat(ui): ResizeHandle supports onResizeStart/onResizeEnd callbacks"
```

### Task 4.2: Rewrite BrowserPanel component

**Files:**
- Modify: `src/openacp/components/browser-panel.tsx` (full rewrite)

- [ ] **Step 1: Replace file contents**

Replace the entire file with:

```tsx
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  ArrowSquareOut,
  X,
  ArrowsOutSimple,
  ArrowsInSimple,
  PictureInPicture,
  Warning,
  CaretDown,
} from "@phosphor-icons/react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Button } from "./ui/button"
import { ResizeHandle } from "./ui/resize-handle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { useBrowserPanel, type BrowserMode } from "../context/browser-panel"

const DEFAULT_WIDTH = 480
const MIN_WIDTH = 320
const MAX_WIDTH = 900

function useBoundsSyncDocked(
  containerRef: React.RefObject<HTMLDivElement>,
  mode: BrowserMode,
  active: boolean,
) {
  const sync = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width < 10) return
    invoke("browser_set_mode", {
      mode: "docked",
      bounds: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
    }).catch(() => {})
  }, [containerRef])

  useLayoutEffect(() => {
    if (!active || mode !== "docked") return
    sync()
  }, [active, mode, sync])

  // Window resize — debounced trailing
  useEffect(() => {
    if (!active || mode !== "docked") return
    let rafId: number | null = null
    function onResize() {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        sync()
        rafId = null
      })
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [active, mode, sync])

  return sync
}

export function BrowserPanel() {
  const browser = useBrowserPanel()
  const containerRef = useRef<HTMLDivElement>(null)
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const [isDragging, setIsDragging] = useState(false)
  const [inputUrl, setInputUrl] = useState(browser.url ?? "")

  // Keep address bar in sync with authoritative URL
  useEffect(() => {
    if (browser.url) setInputUrl(browser.url)
  }, [browser.url])

  const syncBounds = useBoundsSyncDocked(
    containerRef,
    browser.mode,
    browser.kind === "ready" && !isDragging,
  )

  const handleResizeStart = useCallback(() => {
    setIsDragging(true)
    if (browser.mode === "docked") {
      invoke("browser_suppress").catch(() => {})
    }
  }, [browser.mode])

  const handleResizeEnd = useCallback(() => {
    setIsDragging(false)
    if (browser.mode === "docked") {
      // Sync final bounds then unsuppress
      const el = containerRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        invoke("browser_set_mode", {
          mode: "docked",
          bounds: {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
        })
          .catch(() => {})
          .finally(() => {
            invoke("browser_unsuppress").catch(() => {})
          })
      } else {
        invoke("browser_unsuppress").catch(() => {})
      }
    }
  }, [browser.mode])

  const handleSubmitUrl = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = inputUrl.trim()
      if (!trimmed) return
      let finalUrl = trimmed
      const looksLikeUrl = /^https?:\/\//i.test(trimmed)
      const looksLikeDomain = /^[^\s]+\.[^\s]+$/.test(trimmed)
      if (!looksLikeUrl) {
        if (looksLikeDomain) {
          finalUrl = `https://${trimmed}`
        } else {
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
        }
      }
      void browser.navigate(finalUrl)
    },
    [inputUrl, browser],
  )

  const handleSetMode = useCallback(
    (mode: BrowserMode) => {
      if (mode === "docked") {
        const el = containerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        void browser.setMode("docked", {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        })
      } else {
        void browser.setMode(mode)
      }
    },
    [browser],
  )

  const handleOpenExternal = useCallback(() => {
    if (browser.url) openUrl(browser.url).catch(console.error)
  }, [browser.url])

  const handleRetry = useCallback(() => {
    if (browser.url) void browser.navigate(browser.url)
  }, [browser])

  const isLoading = browser.kind === "opening" || browser.kind === "navigating"
  const showError = browser.kind === "error" && browser.error

  return (
    <div
      className="relative flex flex-col h-full border-l border-border-weak bg-background"
      style={{ width: panelWidth }}
    >
      <ResizeHandle
        direction="horizontal"
        edge="start"
        size={panelWidth}
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        onResize={setPanelWidth}
        onResizeStart={handleResizeStart}
        onResizeEnd={handleResizeEnd}
      />

      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border-weak">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void browser.back()}
          disabled={!browser.canGoBack}
          title="Back"
        >
          <ArrowLeft size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void browser.forward()}
          disabled={!browser.canGoForward}
          title="Forward"
        >
          <ArrowRight size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void browser.reload()}
          title="Reload"
        >
          <ArrowClockwise size={14} />
        </Button>

        <form className="flex-1 min-w-0" onSubmit={handleSubmitUrl}>
          <input
            className="w-full h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground outline-none focus:border-primary font-mono truncate"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Enter URL or search..."
            spellCheck={false}
          />
        </form>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" title="Mode">
              {browser.mode === "docked" && <ArrowsOutSimple size={14} />}
              {browser.mode === "floating" && <ArrowsInSimple size={14} />}
              {browser.mode === "pip" && <PictureInPicture size={14} />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handleSetMode("docked")}>
              <ArrowsInSimple size={14} className="mr-2" /> Docked
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSetMode("floating")}>
              <ArrowsOutSimple size={14} className="mr-2" /> Floating
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleSetMode("pip")}>
              <PictureInPicture size={14} className="mr-2" /> Picture in Picture
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon-sm" onClick={handleOpenExternal} title="Open in system browser">
          <ArrowSquareOut size={14} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => void browser.close()} title="Close">
          <X size={14} />
        </Button>
      </div>

      {/* Top-bar loading indicator */}
      {isLoading && (
        <div className="absolute top-[38px] left-0 right-0 h-0.5 bg-primary/20 overflow-hidden pointer-events-none">
          <div className="h-full w-1/3 bg-primary animate-[loading_1.2s_ease-in-out_infinite]" />
        </div>
      )}

      {/* Content container — native webview overlays this area */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        {isDragging && (
          <div className="absolute inset-0 bg-muted/40 border border-dashed border-border-weak flex items-center justify-center">
            <div className="text-xs text-muted-foreground">Resizing…</div>
          </div>
        )}
        {browser.mode !== "docked" && browser.kind === "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80">
            <div className="text-sm text-muted-foreground">
              Browser is in {browser.mode} mode
            </div>
            <Button variant="outline" size="sm" onClick={() => handleSetMode("docked")}>
              Dock here
            </Button>
          </div>
        )}
        {showError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6">
            <Warning size={32} className="text-destructive" />
            <div className="text-sm font-medium">Failed to load</div>
            <div className="text-xs text-muted-foreground max-w-[260px] text-center font-mono break-all">
              {browser.url}
            </div>
            <div className="text-xs text-muted-foreground max-w-[280px] text-center">
              {browser.error}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenExternal}>
                Open externally
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `loading` keyframes to global styles if not present**

Check `src/openacp/styles/utilities.css` for a `@keyframes loading` definition. If missing, add:

```css
@keyframes loading {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -30`
Expected: clean or only import-related errors fixable with imports.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/components/browser-panel.tsx src/openacp/styles/utilities.css
git commit -m "refactor(browser): rewrite BrowserPanel to use context and proper lifecycle"
```

### Task 4.3: Update app.tsx to render new BrowserPanel

**Files:**
- Modify: `src/openacp/app.tsx`

- [ ] **Step 1: Update render site**

Find the `<BrowserPanel url={...} onClose={...} onUrlChange={...} />` usage (from Task 2.3) and change to `<BrowserPanel />` — the component now reads everything from context.

- [ ] **Step 2: Update the open path**

In `handleOpenInBrowser`, compute initial bounds from a measured container ref if possible, otherwise pass `undefined` and let Rust use fallback bounds. The container ref is inside `BrowserPanel`, which mounts after `AnimatePresence` → we don't have bounds yet at open time.

Acceptable pattern: pass no bounds on first open; `BrowserPanel`'s `useLayoutEffect` inside `useBoundsSyncDocked` will call `browser_set_mode(docked, actualBounds)` immediately after mount, which snaps the webview to the right place.

- [ ] **Step 3: Typecheck + smoke test**

```bash
pnpm exec tsc --noEmit 2>&1 | tail -10
pnpm tauri dev  # open a link from chat, verify browser renders
```

- [ ] **Step 4: Commit**

```bash
git add src/openacp/app.tsx
git commit -m "refactor(app): render new context-driven BrowserPanel"
```

---

## Chunk 5: Settings, Lifecycle Polish, Edge Cases

Adds settings fields for mode persistence and search engine, UI in settings-general, lifecycle cleanups (workspace switch, app quit, float/pip window close handler), and final smoke-test pass.

### File inventory for this chunk

- **Modify**: `src/openacp/lib/settings-store.ts`
- **Modify**: `src/openacp/components/settings/settings-general.tsx`
- **Modify**: `src/openacp/app.tsx` (workspace switch auto-close, mode persistence wiring)
- **Modify**: `src-tauri/src/core/browser.rs` (float/pip window close → state transition)
- **Modify**: `src-tauri/src/lib.rs` (wire `WindowEvent::CloseRequested` handler for float/pip labels)

### Task 5.1: Extend settings store with browser fields

**Files:**
- Modify: `src/openacp/lib/settings-store.ts`

- [ ] **Step 1: Extend `AppSettings` and defaults**

Replace the `AppSettings` interface and `defaults` const:

```ts
export interface AppSettings {
  theme: "dark" | "light" | "system"
  fontSize: "small" | "medium" | "large"
  language: string
  devMode: boolean
  browserPanel: boolean
  browserLastMode: "docked" | "floating" | "pip"
  browserSearchEngine: "google" | "duckduckgo" | "bing"
}

const defaults: AppSettings = {
  theme: "dark",
  fontSize: "medium",
  language: "en",
  devMode: false,
  browserPanel: false,
  browserLastMode: "docked",
  browserSearchEngine: "google",
}
```

- [ ] **Step 2: Extend `getAllSettings` to load new fields**

Add loading for `browserLastMode` and `browserSearchEngine` in `getAllSettings`, following the existing pattern.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: `getAllSettings` return type matches; any call site referencing the return value via spread is still fine.

- [ ] **Step 4: Commit**

```bash
git add src/openacp/lib/settings-store.ts
git commit -m "feat(settings): add browserLastMode and browserSearchEngine"
```

### Task 5.2: Add settings UI for new browser options

**Files:**
- Modify: `src/openacp/components/settings/settings-general.tsx`

- [ ] **Step 1: Load new settings at component mount**

In the existing `useEffect`, load `browserLastMode` and `browserSearchEngine` alongside `browserPanel`. Add local state for each.

- [ ] **Step 2: Render additional SettingRows inside the Browser SettingCard**

Below the existing `browserPanel` toggle, add:

```tsx
<SettingRow label="Default mode" description="Which mode to open the browser panel in">
  <select
    className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground-weak focus:outline-none focus:ring-1 focus:ring-border-selected min-w-[160px]"
    value={browserLastMode}
    onChange={async (e) => {
      const next = e.target.value as "docked" | "floating" | "pip"
      setBrowserLastMode(next)
      await setSetting("browserLastMode", next)
    }}
    disabled={!browserPanel}
  >
    <option value="docked">Docked</option>
    <option value="floating">Floating</option>
    <option value="pip">Picture in Picture</option>
  </select>
</SettingRow>

<SettingRow label="Search engine" description="Used when you type a query instead of a URL">
  <select
    className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground-weak focus:outline-none focus:ring-1 focus:ring-border-selected min-w-[160px]"
    value={browserSearchEngine}
    onChange={async (e) => {
      const next = e.target.value as "google" | "duckduckgo" | "bing"
      setBrowserSearchEngine(next)
      await setSetting("browserSearchEngine", next)
    }}
    disabled={!browserPanel}
  >
    <option value="google">Google</option>
    <option value="duckduckgo">DuckDuckGo</option>
    <option value="bing">Bing</option>
  </select>
</SettingRow>
```

- [ ] **Step 3: Update SettingCard title to remove "Experimental" suffix (optional)**

Change `title="Browser (Experimental)"` to `title="Browser"` — the stabilization work removes the experimental marking.

- [ ] **Step 4: Smoke test + commit**

```bash
pnpm exec tsc --noEmit 2>&1 | tail -5
pnpm tauri dev  # open settings → Browser section → verify new selects render and persist
git add src/openacp/components/settings/settings-general.tsx
git commit -m "feat(settings): expose browser mode and search engine options"
```

### Task 5.3: Persist `browserLastMode` on mode change

**Files:**
- Modify: `src/openacp/context/browser-panel.tsx`

- [ ] **Step 1: Write to settings from `setMode`**

Import `setSetting` and call it inside the `setMode` callback:

```tsx
import { setSetting } from "../lib/settings-store"

// inside setMode:
const setMode = useCallback(
  async (mode: BrowserMode, bounds?: BrowserBounds) => {
    await invoke("browser_set_mode", { mode, bounds: bounds ?? null })
    void setSetting("browserLastMode", mode).catch(() => {})
  },
  [],
)
```

- [ ] **Step 2: Use stored mode as default when opening from link interceptor**

Update `open` to accept an optional mode param; in `app.tsx` `handleOpenInBrowser`, load `browserLastMode` setting and pass it:

```tsx
import { getSetting } from "./lib/settings-store"

function handleOpenInBrowser(e: Event) {
  const { url } = (e as CustomEvent).detail
  if (!url) return
  if (browserPanelEnabled) {
    void getSetting("browserLastMode").then((mode) => browser.open(url, undefined, mode))
  } else {
    import("@tauri-apps/plugin-opener")
      .then(({ openUrl }) => openUrl(url))
      .catch(console.error)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/openacp/context/browser-panel.tsx src/openacp/app.tsx
git commit -m "feat(browser): persist and restore last-used browser mode"
```

### Task 5.4: Auto-close browser on workspace switch

**Files:**
- Modify: `src/openacp/app.tsx`

- [ ] **Step 1: Close browser when `active` workspace changes**

In `AppInterface`, add a useEffect that watches `active` and calls `browser.close()` on change:

```tsx
const prevActiveRef = useRef(active)
useEffect(() => {
  if (prevActiveRef.current !== active && browser.isVisible) {
    void browser.close()
  }
  prevActiveRef.current = active
}, [active, browser])
```

- [ ] **Step 2: Commit**

```bash
git add src/openacp/app.tsx
git commit -m "feat(browser): auto-close browser panel on workspace switch"
```

### Task 5.5: Handle float/pip window close events in Rust

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Listen for WindowEvent::CloseRequested on float/pip labels**

In the `.run(|_app, event| { ... })` callback at the bottom of `lib.rs`, extend the match on `event`:

```rust
.run(|app, event| match event {
    tauri::RunEvent::Exit => {
        tracing::info!("App exiting");
    }
    tauri::RunEvent::WindowEvent {
        label,
        event: tauri::WindowEvent::CloseRequested { .. },
        ..
    } if label == "browser-float" || label == "browser-pip" => {
        // User clicked the native close button on a float/PiP window.
        // Transition browser back to Idle without orphaning the webview.
        if let Some(store) = app.try_state::<openacp_lib::core::browser::BrowserStore>() {
            let app_clone = app.clone();
            let store = store.inner();
            tauri::async_runtime::spawn(async move {
                let _ = openacp_lib::core::browser::browser_close(app_clone, store).await;
            });
        }
    }
    _ => {}
});
```

Note: `openacp_lib::core::browser::BrowserStore` path depends on crate name — the `[lib] name = "openacp_lib"` in `Cargo.toml` makes this correct. Adjust `pub use` exports in `core/mod.rs` if needed so the types are reachable from `lib.rs`.

Simpler alternative: put the close handler inside a helper fn inside `browser.rs` and call it from `lib.rs` via `core::browser::handle_window_close(&app)`.

- [ ] **Step 2: Add helper to browser.rs if using the simpler path**

```rust
pub fn handle_window_close(app: &AppHandle) {
    if let Some(store) = app.try_state::<BrowserStore>() {
        let app_clone = app.clone();
        let store_ptr = store.inner() as *const BrowserStoreInner;
        // The cleanest path: just transition state directly without going through
        // the async command since we're in an event loop.
        if let Some(wv) = app.get_webview(BROWSER_LABEL) {
            let _ = wv.close();
        }
        close_window_if_exists(&app_clone, FLOAT_LABEL);
        close_window_if_exists(&app_clone, PIP_LABEL);
        if let Ok(mut inner) = store.inner.lock() {
            inner.state = BrowserState::Idle;
            inner.history = History::default();
            inner.suppress_count = 0;
            inner.last_docked_bounds = None;
            emit_state(&app_clone, &inner);
        }
        let _ = store_ptr; // silence unused
    }
}
```

Then in `lib.rs` the handler becomes:

```rust
tauri::RunEvent::WindowEvent {
    label,
    event: tauri::WindowEvent::CloseRequested { .. },
    ..
} if label == "browser-float" || label == "browser-pip" => {
    core::browser::handle_window_close(app);
}
```

- [ ] **Step 3: Run cargo check + smoke test**

```bash
cd src-tauri && cargo check 2>&1 | tail -20
cd .. && pnpm tauri dev  # open browser, switch to floating, click X on float window → verify browser state transitions to Idle
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/core/browser.rs src-tauri/src/lib.rs
git commit -m "feat(browser): handle float/pip window close via lifecycle hook"
```

### Task 5.6: Final smoke-test checklist

**Files:**
- None (manual verification)

- [ ] **Run full end-to-end manual tests**

Enable browser panel in settings. Then for each scenario, verify:

1. **Open from chat link**
   - [ ] Click a `https://...` link in an agent response
   - [ ] Panel slides in from right with docked webview
   - [ ] URL bar shows the correct URL
   - [ ] Back/Forward disabled initially

2. **Navigation**
   - [ ] Click a link inside the browser → URL bar updates
   - [ ] Back button enables → click → goes back → URL bar updates
   - [ ] Forward button enables → click → goes forward
   - [ ] Reload button reloads current page

3. **Search fallback**
   - [ ] Type `hello world` (no protocol) in URL bar → navigates to Google search

4. **Panel resize (drag handle)**
   - [ ] Drag left-edge handle → ghost placeholder shows, webview hidden
   - [ ] Release → webview reappears at new bounds, no lag

5. **Window resize**
   - [ ] Resize main window → webview scales with panel

6. **Modal overlay**
   - [ ] Open Settings (Dialog) → browser webview hides cleanly
   - [ ] Close Settings → browser reappears at correct position
   - [ ] Repeat with Popover, DropdownMenu (mode selector itself)

7. **Mode switching**
   - [ ] Click mode selector → Floating → new window opens with same URL, scroll position preserved
   - [ ] Click Dock inside float window → webview returns to panel, state preserved
   - [ ] Mode → PiP → small always-on-top window, still functional
   - [ ] Click X on float/PiP window → browser state returns to Idle

8. **Error handling**
   - [ ] Type `https://thisdomaindoesntexist.invalid` → error card with Retry / Open externally
   - [ ] Click Retry on valid URL → loads successfully

9. **Lifecycle**
   - [ ] Rapid open/close the panel 10× quickly → no orphan webviews (check via devtools network tab or OS process monitor)
   - [ ] Switch workspace with browser open → browser auto-closes
   - [ ] Quit app with browser open → clean shutdown, no zombie windows

10. **Mode persistence**
   - [ ] Set mode to Floating, close app, relaunch, open browser → opens in Floating

- [ ] **If all pass, commit a checkpoint**

```bash
git commit --allow-empty -m "chore(browser): verified all stabilization scenarios"
```

---

## Post-implementation checklist

- [ ] Run `pnpm build` to verify TypeScript production build passes
- [ ] Run `cd src-tauri && cargo clippy -- -D warnings 2>&1 | tail -20` to catch lint issues
- [ ] Manual smoke test on macOS (primary target)
- [ ] Update spec's "Status" from `Draft` to `Implemented`
- [ ] Push branch and open PR against `develop` — **ASK USER FIRST** before `git push`

## Known out-of-scope items (v2 work)

- Per-workspace cookie isolation via `clearAllBrowsingData` on workspace switch
- Custom borderless PiP chrome (currently uses native decorations)
- Linux Wayland graceful degradation (detect Wayland, disable docked, use system browser)
- Crash detection beyond the 30s heartbeat polling — requires platform-specific code
- Tab support (single URL per browser instance)
