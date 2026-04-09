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
        })
        .on_page_load(move |_wv, payload| {
            use tauri::webview::PageLoadEvent;
            if matches!(payload.event(), PageLoadEvent::Finished) {
                emit_page_loaded(&app_for_load, payload.url().as_str());
            }
        });

    window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(|e| format!("add_child failed: {e}"))?;

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
            let float_win = app
                .get_window(FLOAT_LABEL)
                .ok_or("float window not found after create")?;
            wv.reparent(&float_win).map_err(|e| e.to_string())?;
            float.show().map_err(|e| e.to_string())?;
            close_window_if_exists(app, PIP_LABEL);
        }
        BrowserMode::Pip => {
            let pip = ensure_pip_window(app)?;
            let pip_win = app
                .get_window(PIP_LABEL)
                .ok_or("pip window not found after create")?;
            wv.reparent(&pip_win).map_err(|e| e.to_string())?;
            pip.show().map_err(|e| e.to_string())?;
            close_window_if_exists(app, FLOAT_LABEL);
        }
    }
    Ok(())
}

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
