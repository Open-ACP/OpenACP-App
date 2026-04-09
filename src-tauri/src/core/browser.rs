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
