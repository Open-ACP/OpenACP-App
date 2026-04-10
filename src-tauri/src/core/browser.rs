use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, Url, WebviewUrl,
};
use tauri::webview::WebviewBuilder;
use tauri::window::WindowBuilder;

const BROWSER_LABEL: &str = "browser-panel";
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
    /// Guard against concurrent `browser_show` calls creating duplicate webviews.
    creating: bool,
    /// Set true before a programmatic Back/Forward navigate so the on_navigation
    /// callback skips pushing to history (cursor was already moved).
    programmatic_nav: bool,
    /// Set true while `browser_close` is in progress so the window close event
    /// handler (`handle_window_close`) knows it's a programmatic close and
    /// skips its own re-entrant cleanup that would race against browser_close.
    closing: bool,
    /// Set true while a mode switch is in progress so concurrent
    /// `browser_set_mode` or `browser_show` calls don't race on reparent.
    switching_mode: bool,
}

impl BrowserStore {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(BrowserStoreInner {
                state: BrowserState::Idle,
                history: History::default(),
                suppress_count: 0,
                last_docked_bounds: None,
                creating: false,
                programmatic_nav: false,
                closing: false,
                switching_mode: false,
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
    let parsed = url.parse::<Url>().map_err(|e| format!("invalid URL: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("unsupported URL scheme: {}", parsed.scheme()));
    }
    Ok(parsed)
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
            // Skip internal schemes (about:, data:, chrome:, file:, etc.).
            // These fire on initial webview creation and intermediate loading
            // states. Pushing them to history and emitting them as the current
            // URL pollutes the React state — the address bar ends up showing
            // "about:blank" and Back goes to an unloadable page. Only track
            // real http(s) navigations.
            if !matches!(url.scheme(), "http" | "https") {
                return true;
            }
            // Track Rust-side history on top-level navigation. If the navigation
            // was triggered programmatically by a Back/Forward command, skip
            // pushing — the cursor was already moved by go_back/go_forward and
            // pushing here would corrupt the forward stack.
            if let Some(store) = app_for_nav.try_state::<BrowserStore>() {
                if let Ok(mut inner) = store.inner.lock() {
                    if inner.programmatic_nav {
                        inner.programmatic_nav = false;
                    } else {
                        inner.history.push(url.to_string());
                    }
                    emit_state(&app_for_nav, &inner);
                }
            }
            emit_url(&app_for_nav, url.as_str());
            true // allow
        })
        .on_page_load(move |_wv, payload| {
            use tauri::webview::PageLoadEvent;
            let url = payload.url();
            // Same filter as on_navigation — skip about:/data:/etc.
            if !matches!(url.scheme(), "http" | "https") {
                return;
            }
            match payload.event() {
                PageLoadEvent::Started => {
                    // Fallback for navigations that on_navigation misses
                    // (e.g., server-side redirects). BUT only emit when the
                    // URL is actually different from the currently-tracked
                    // URL — Tauri may fire Started spuriously on window focus
                    // / activation with the initial-load URL, which would
                    // otherwise roll the address bar back to the first URL
                    // whenever the user presses the Pop-out window title bar.
                    let should_track = if let Some(store) =
                        app_for_load.try_state::<BrowserStore>()
                    {
                        if let Ok(inner) = store.inner.lock() {
                            let current = match &inner.state {
                                BrowserState::Ready { url: u, .. }
                                | BrowserState::Opening { url: u, .. }
                                | BrowserState::Error { url: u, .. } => u.clone(),
                                BrowserState::Navigating { to, .. } => to.clone(),
                                _ => String::new(),
                            };
                            current.as_str() != url.as_str()
                        } else {
                            false
                        }
                    } else {
                        false
                    };

                    if should_track {
                        if let Some(store) =
                            app_for_load.try_state::<BrowserStore>()
                        {
                            if let Ok(mut inner) = store.inner.lock() {
                                if inner.programmatic_nav {
                                    inner.programmatic_nav = false;
                                } else {
                                    inner.history.push(url.to_string());
                                }
                                emit_state(&app_for_load, &inner);
                            }
                        }
                        emit_url(&app_for_load, url.as_str());
                    }
                }
                PageLoadEvent::Finished => {
                    emit_page_loaded(&app_for_load, url.as_str());
                }
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

/// Ensure PiP window exists, return its handle.
///
/// Uses `WindowBuilder` (not `WebviewWindowBuilder`) so the window is created
/// WITHOUT a default child webview. This matters because reparenting the
/// browser-panel webview into a window that already has its own embedded
/// webview produces two overlapping webviews, which breaks rendering and
/// causes close-time races.
fn ensure_pip_window(app: &AppHandle) -> Result<tauri::Window, String> {
    if let Some(w) = app.get_window(PIP_LABEL) {
        return Ok(w);
    }
    WindowBuilder::new(app, PIP_LABEL)
        .title("Browser (PiP)")
        .inner_size(420.0, 300.0)
        .min_inner_size(280.0, 180.0)
        .resizable(true)
        .decorations(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| format!("pip window build failed: {e}"))
}

/// Hide a sibling window without destroying it. Used during mode switches
/// so that closing the window does NOT trigger `handle_window_close` (the
/// user-initiated close handler) which would destroy the browser webview
/// we just reparented.
fn hide_window_if_exists(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_window(label) {
        let _ = w.hide();
    }
}

fn close_window_if_exists(app: &AppHandle, label: &str) {
    if let Some(w) = app.get_window(label) {
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
    // Acquire the creation guard and transition to Opening atomically.
    // Two rapid calls would otherwise both pass an `is_none()` check on the
    // webview and both try to add a child with the same label.
    {
        let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
        if inner.creating {
            return Err("browser_show already in progress".into());
        }
        inner.creating = true;
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

    // Wrap the fallible work in an IIFE so we can transition to a recoverable
    // Error state on any failure instead of leaving the state stuck in Opening.
    let result: Result<(), String> = (|| {
        if app.get_webview(BROWSER_LABEL).is_none() {
            let bounds = opts.bounds.unwrap_or(Bounds {
                x: 0.0,
                y: 0.0,
                width: 480.0,
                height: 600.0,
            });
            create_child_in_main(&app, &opts.url, bounds)?;
        } else if let Some(wv) = app.get_webview(BROWSER_LABEL) {
            let parsed = parse_url(&opts.url)?;
            wv.navigate(parsed).map_err(|e| e.to_string())?;
        }
        reparent_to_mode(&app, opts.mode, opts.bounds)?;
        Ok(())
    })();

    match result {
        Ok(()) => {
            let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
            inner.creating = false;
            inner.state = BrowserState::Ready {
                url: opts.url,
                mode: opts.mode,
            };
            emit_state(&app, &inner);
            Ok(())
        }
        Err(e) => {
            let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
            inner.creating = false;
            inner.state = BrowserState::Error {
                url: opts.url.clone(),
                message: e.clone(),
                mode: opts.mode,
            };
            emit_state(&app, &inner);
            drop(inner);
            emit_nav_error(&app, &opts.url, &e);
            Err(e)
        }
    }
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

    // Skip reparent if the webview is already parented to the target window.
    // On macOS WKWebView, repeated reparent() calls to the same parent can
    // intermittently deadlock the webview's main thread, causing the app to
    // become unresponsive.
    let current_parent = wv.window().label().to_string();

    match mode {
        BrowserMode::Docked | BrowserMode::Floating => {
            // Both Docked and Floating (in-app mini player) host the webview
            // inside the main window. The only difference is position/size:
            // Docked fills the sidebar panel slot, Floating hovers in a corner.
            // Bounds are computed and supplied by React.
            if current_parent != MAIN_LABEL {
                let main = app.get_window(MAIN_LABEL).ok_or("main window not found")?;
                wv.reparent(&main).map_err(|e| e.to_string())?;
            }
            if let Some(b) = bounds {
                wv.set_position(tauri::Position::Logical(LogicalPosition::new(b.x, b.y)))
                    .map_err(|e| e.to_string())?;
                wv.set_size(tauri::Size::Logical(LogicalSize::new(b.width, b.height)))
                    .map_err(|e| e.to_string())?;
            }
            let _ = wv.show();
            // Hide (don't close) the PiP window so the close event doesn't
            // fire `handle_window_close` and destroy the webview we just moved.
            hide_window_if_exists(app, PIP_LABEL);
        }
        BrowserMode::Pip => {
            // PiP = desktop always-on-top separate window.
            let pip = ensure_pip_window(app)?;
            if current_parent != PIP_LABEL {
                wv.reparent(&pip).map_err(|e| e.to_string())?;
            }
            pip.show().map_err(|e| e.to_string())?;
            fill_window(&wv, &pip)?;
            let _ = wv.show();
            // Make the PiP window the key window so it receives input events
            // (scroll, keyboard). Without this, the main window keeps focus and
            // the webview inside pip is visible but inert — scroll wheel events
            // are dispatched to whatever window is currently focused.
            let _ = pip.set_focus();
            let _ = wv.set_focus();
        }
    }
    Ok(())
}

/// Position and size the webview to fill the given window's client area.
/// Used after reparenting to PiP so the webview is visible in the new parent.
fn fill_window<R: tauri::Runtime>(
    wv: &tauri::Webview<R>,
    win: &tauri::Window<R>,
) -> Result<(), String> {
    let size = win.inner_size().map_err(|e| e.to_string())?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let logical_w = size.width as f64 / scale;
    let logical_h = size.height as f64 / scale;
    wv.set_position(tauri::Position::Logical(LogicalPosition::new(0.0, 0.0)))
        .map_err(|e| e.to_string())?;
    wv.set_size(tauri::Size::Logical(LogicalSize::new(logical_w, logical_h)))
        .map_err(|e| e.to_string())?;
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
                let t = inner.history.go_back().map(|s| s.to_string());
                if t.is_some() {
                    inner.programmatic_nav = true;
                }
                t
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
                let t = inner.history.go_forward().map(|s| s.to_string());
                if t.is_some() {
                    inner.programmatic_nav = true;
                }
                t
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
    // Guard against concurrent mode switches — if user clicks Dock twice in
    // quick succession, or a drag-end bounds sync races with a mode-selector
    // click, both could hit reparent_to_mode simultaneously and deadlock the
    // webview. Drop the second caller silently.
    {
        let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
        if inner.switching_mode {
            return Ok(());
        }
        inner.switching_mode = true;
    }

    // Check if we're leaving PiP (separate WKWebView-hosting window). On macOS,
    // reparenting a webview out of its own WebviewWindow is unreliable and
    // can deadlock the main thread. For PiP → Docked/Floating, destroy the
    // webview and recreate it in the main window instead. This loses in-page
    // history (back/forward inside the tab) but preserves the current URL.
    let needs_recreate = {
        let parent_label = app
            .get_webview(BROWSER_LABEL)
            .map(|w| w.window().label().to_string())
            .unwrap_or_default();
        parent_label == PIP_LABEL && mode != BrowserMode::Pip
    };

    let result: Result<(), String> = if needs_recreate {
        // Capture the URL and docked bounds fallback from state before destroying.
        let (current_url, fallback_bounds) = {
            let inner = store.inner.lock().map_err(|e| e.to_string())?;
            let url = match &inner.state {
                BrowserState::Ready { url, .. }
                | BrowserState::Opening { url, .. }
                | BrowserState::Error { url, .. } => url.clone(),
                BrowserState::Navigating { to, .. } => to.clone(),
                _ => String::new(),
            };
            (url, inner.last_docked_bounds)
        };

        // Destroy the webview and the PiP window. handle_window_close
        // short-circuits because switching_mode is set.
        if let Some(wv) = app.get_webview(BROWSER_LABEL) {
            let _ = wv.close();
        }
        close_window_if_exists(&app, PIP_LABEL);
        tokio::time::sleep(std::time::Duration::from_millis(60)).await;

        // Recreate in main with the last URL. Bounds: explicit > fallback > default.
        let effective_bounds = bounds.or(fallback_bounds).unwrap_or(Bounds {
            x: 0.0,
            y: 48.0,
            width: 480.0,
            height: 600.0,
        });
        if !current_url.is_empty() {
            create_child_in_main(&app, &current_url, effective_bounds)
        } else {
            Err("cannot recreate webview: no URL in state".into())
        }
    } else {
        reparent_to_mode(&app, mode, bounds)
    };

    // Always clear the guard, even on error.
    let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
    inner.switching_mode = false;

    // Propagate any error after clearing the guard.
    result?;

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
    // Set the `closing` guard so any WindowEvent::CloseRequested that fires
    // for the PiP window (as a side-effect of close_window_if_exists below)
    // will short-circuit handle_window_close instead of racing with us.
    {
        let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
        if inner.closing {
            return Ok(()); // already in progress
        }
        inner.closing = true;
        inner.state = BrowserState::Closing;
        emit_state(&app, &inner);
    }

    if let Some(wv) = app.get_webview(BROWSER_LABEL) {
        let _ = wv.close();
    }
    close_window_if_exists(&app, PIP_LABEL);

    {
        let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
        inner.state = BrowserState::Idle;
        inner.history = History::default();
        inner.suppress_count = 0;
        inner.last_docked_bounds = None;
        inner.creating = false;
        inner.programmatic_nav = false;
        inner.closing = false;
        inner.switching_mode = false;
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
            // Re-sync bounds only when docked — in floating/pip modes the webview
            // fills its own window and `last_docked_bounds` would place it off-screen.
            let current_mode = match &inner.state {
                BrowserState::Ready { mode, .. }
                | BrowserState::Opening { mode, .. }
                | BrowserState::Navigating { mode, .. }
                | BrowserState::Error { mode, .. } => Some(*mode),
                _ => None,
            };
            if current_mode == Some(BrowserMode::Docked) {
                if let Some(b) = inner.last_docked_bounds {
                    let _ = wv.set_position(tauri::Position::Logical(LogicalPosition::new(
                        b.x, b.y,
                    )));
                    let _ = wv.set_size(tauri::Size::Logical(LogicalSize::new(b.width, b.height)));
                }
            }
        }
    }
    emit_state(&app, &inner);
    Ok(())
}

/// Called from lib.rs when the user clicks the native close button on
/// the Pop-out window's traffic light.
///
/// Rather than destroying the webview (which hangs macOS because the webview
/// is mid-close along with its parent window), this schedules an async task
/// that waits for the window close to complete, then recreates the webview
/// in the main window at the last docked bounds. From the user's perspective,
/// closing the Pop-out window transitions the browser back to docked mode
/// instead of fully closing it.
///
/// Short-circuits if `browser_close` or a mode switch is already in progress.
pub fn handle_window_close(app: &AppHandle) {
    // Check guards first — if another command is already handling this, skip.
    if let Some(store) = app.try_state::<BrowserStore>() {
        if let Ok(inner) = store.inner.lock() {
            if inner.closing || inner.switching_mode {
                return;
            }
        }
    }

    // Capture URL and docked bounds, and set the switching_mode guard so no
    // other command races with the async recreate below.
    let (current_url, fallback_bounds) = {
        let Some(store) = app.try_state::<BrowserStore>() else {
            return;
        };
        let Ok(mut inner) = store.inner.lock() else {
            return;
        };
        let url = match &inner.state {
            BrowserState::Ready { url, .. }
            | BrowserState::Opening { url, .. }
            | BrowserState::Error { url, .. } => url.clone(),
            BrowserState::Navigating { to, .. } => to.clone(),
            _ => String::new(),
        };
        let bounds = inner.last_docked_bounds;
        inner.switching_mode = true;
        (url, bounds)
    };

    // IMPORTANT: do NOT call wv.close() here. The webview is inside the
    // Pop-out window which is already in its close sequence — destroying it
    // mid-close deadlocks macOS WKWebView. Let the window close naturally;
    // its child webview is cleaned up with it.
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        // Wait for the Pop-out window close to fully complete so the webview
        // label is freed before we create a new one with the same label.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;

        let finalize = |state: BrowserState| {
            if let Some(store) = app_clone.try_state::<BrowserStore>() {
                if let Ok(mut inner) = store.inner.lock() {
                    inner.state = state;
                    inner.switching_mode = false;
                    emit_state(&app_clone, &inner);
                }
            }
        };

        if current_url.is_empty() {
            // No URL to restore — fully reset to Idle.
            if let Some(store) = app_clone.try_state::<BrowserStore>() {
                if let Ok(mut inner) = store.inner.lock() {
                    inner.state = BrowserState::Idle;
                    inner.history = History::default();
                    inner.suppress_count = 0;
                    inner.last_docked_bounds = None;
                    inner.creating = false;
                    inner.programmatic_nav = false;
                    inner.closing = false;
                    inner.switching_mode = false;
                    emit_state(&app_clone, &inner);
                }
            }
            return;
        }

        // Recreate webview in main window at last known docked bounds.
        let bounds = fallback_bounds.unwrap_or(Bounds {
            x: 0.0,
            y: 48.0,
            width: 480.0,
            height: 600.0,
        });
        match create_child_in_main(&app_clone, &current_url, bounds) {
            Ok(()) => finalize(BrowserState::Ready {
                url: current_url,
                mode: BrowserMode::Docked,
            }),
            Err(e) => finalize(BrowserState::Error {
                url: current_url,
                message: e,
                mode: BrowserMode::Docked,
            }),
        }
    });
}

#[tauri::command]
pub async fn browser_reset_suppress(
    app: AppHandle,
    store: State<'_, BrowserStore>,
) -> Result<(), String> {
    // Snapshot suppression state, docked bounds, and current mode, then drop the
    // lock before touching the webview to avoid holding the mutex across IPC calls.
    let (was_suppressed, bounds, current_mode) = {
        let mut inner = store.inner.lock().map_err(|e| e.to_string())?;
        let was_suppressed = inner.suppress_count > 0;
        inner.suppress_count = 0;
        let mode = match &inner.state {
            BrowserState::Ready { mode, .. }
            | BrowserState::Opening { mode, .. }
            | BrowserState::Navigating { mode, .. }
            | BrowserState::Error { mode, .. } => Some(*mode),
            _ => None,
        };
        (was_suppressed, inner.last_docked_bounds, mode)
    };

    if was_suppressed {
        if let Some(wv) = app.get_webview(BROWSER_LABEL) {
            let _ = wv.show();
            // Only re-apply docked bounds when actually in docked mode.
            if current_mode == Some(BrowserMode::Docked) {
                if let Some(b) = bounds {
                    let _ = wv.set_position(tauri::Position::Logical(LogicalPosition::new(
                        b.x, b.y,
                    )));
                    let _ = wv.set_size(tauri::Size::Logical(LogicalSize::new(b.width, b.height)));
                }
            }
        }
    }

    let inner = store.inner.lock().map_err(|e| e.to_string())?;
    emit_state(&app, &inner);
    Ok(())
}
