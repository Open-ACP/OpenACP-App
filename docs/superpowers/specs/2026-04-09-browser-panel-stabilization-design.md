# In-App Browser Stabilization & PiP — Design Spec

**Date:** 2026-04-09
**Status:** Draft
**Scope:** `OpenACP-App` — `src/openacp/components/browser-panel.tsx`, `src-tauri/src/core/browser.rs`, `src/openacp/app.tsx`, `src/openacp/context/`, `src/openacp/components/ui/*` (Dialog/Popover/Sheet/Tooltip wrappers)

---

## Problem

The current in-app browser panel is unstable and has known UX issues:

1. **Resize not smooth** — `ResizeObserver` → `requestAnimationFrame` → `invoke("browser_set_bounds")` fires IPC on every frame, causing the native webview to visibly lag behind the DOM container during panel resize and window resize.
2. **Webview z-order covers modals/backdrops** — Tauri child webviews are native OS layers that render above all HTML content. Any Radix Dialog/Popover/Sheet/Tooltip that visually overlaps the browser panel is covered by the webview, breaking UX.
3. **Floating mode is poor** — Toggling dock↔float destroys and recreates the webview, losing URL history, scroll position, form state, and any logged-in session.
4. **No Picture-in-Picture mode** — Only docked + floating; no compact always-on-top variant.
5. **Lifecycle is fragile** — Race conditions between animation timing and webview init (hardcoded 250ms `setTimeout`), silent failures on rapid open/close, state desync between React and Rust, no crash/error surfacing.

---

## Goals

- Smooth panel resize with no visible webview lag.
- Modals always render above the browser webview (no z-order conflict).
- Mode switching (docked / floating / PiP) preserves URL, scroll position, history, and cookies.
- Three modes: **Docked**, **Floating**, **PiP** — with a persistent state machine and user-selectable default.
- Authoritative lifecycle state machine on the Rust side, with events surfaced to React.
- Error/crash recovery with user-visible retry UI.
- Replace fragile `eval("history.back()")` with Rust-side navigation tracking.
- No new runtime dependencies beyond what Tauri 2 already provides.

---

## Non-Goals

- Tabs. Single active URL per workspace.
- Per-workspace cookie isolation (future work — `clearAllBrowsingData` is available but out of scope).
- iframe fallback mode for sites that block framing (they won't be blocked — this is a native webview).
- Click-through PiP (user wants interactive PiP).
- Full-page devtools integration.
- Linux Wayland support (Tauri `build_as_child` does not support Wayland; graceful degradation to system browser on Wayland).

---

## Key Research Findings Applied

From investigation of Tauri 2 capabilities and open-source prior art:

- **`Webview::reparent(window)`** moves a webview between windows **without destroying it**. State (URL, history, scroll, cookies, form data, in-flight network) is preserved. This is the core mechanism for mode switching.
- **`WebviewBuilder::auto_resize()`** automatically tracks parent window resize. Replaces per-frame manual `browser_set_bounds` IPC storm for window-level resize. Incompatible with manual `set_position` — we only use it for docked mode where the webview fills a known panel region.
- **`WebviewBuilder::on_navigation(|url| bool)`** (Rust) intercepts navigation before it happens; return `false` to cancel.
- **`WebviewBuilder::on_page_load(|webview, payload|)`** fires on Started/Finished with the URL.
- **`WebviewBuilder::initialization_script(js)`** injects JS before page scripts run — used to install error interceptors, navigation hooks, and back/forward polyfills.
- **Z-order is fundamental**: there is no way to render HTML over a native webview. Hide-on-modal-open is the industry-standard workaround (used by Raycast, Pot, Noi, etc.).
- **`add_child` is on `features = ["unstable"]`** in Tauri — already used by current implementation; risk is accepted and documented.

---

## Architecture Overview

### One persistent webview, three parent windows

```
       ┌─────────────────────────┐
       │  Persistent Webview     │  ← single instance, label "browser-panel"
       │  (URL, history, cookies)│
       └───────────┬─────────────┘
                   │ reparent()
       ┌───────────┼───────────────────────────┐
       │           │                           │
       ▼           ▼                           ▼
  ┌─────────┐  ┌────────────────┐      ┌──────────────┐
  │ main    │  │ browser-float  │      │ browser-pip  │
  │ window  │  │  WebviewWindow │      │ WebviewWindow│
  │ (child) │  │ ~800×600       │      │ ~380×240     │
  └─────────┘  │ decorated,     │      │ borderless,  │
   DOCKED      │ resizable      │      │ always-on-top│
               └────────────────┘      └──────────────┘
                  FLOATING                  PIP
```

- **Create**: on first `browser_open` — webview is added as child of `main` window at the panel area bounds.
- **Mode switch**: call `webview.reparent(target_window)` — no destroy, state preserved.
- **Destroy**: only on user close, workspace switch, or app quit.

### Rust state machine

```rust
enum BrowserState {
    Idle,
    Opening { url: String },
    Docked { url: String },
    Floating { url: String },
    Pip { url: String },
    Navigating { from: String, to: String },
    Error { url: String, message: String },
    Closing,
}
```

State is stored in a `Mutex<BrowserState>` on the `AppHandle` (via `tauri::State`). All transitions emit a `browser://state-changed` event with the new state for React to observe.

**Transitions:**
- `Idle → Opening → Docked` (on first open)
- `Docked → Floating` via `reparent`
- `Floating → Docked` via `reparent`
- `Docked/Floating → Pip` via `reparent`
- `Any → Navigating → same` (transient during navigation)
- `Any → Error` on navigation failure / crash
- `Any → Closing → Idle` on close

**Concurrency rules:**
- `open()` while `Closing` → wait for Closing to finish, then proceed.
- `close()` while `Opening` → set cancel flag; when Opening completes, transition directly to Closing.
- Rapid mode toggles → latest wins; intermediate reparents are no-ops if state is already the target.

---

## Rust Command Surface

**Replace the current 8 commands with a cleaner 4-command API:**

```rust
#[tauri::command]
async fn browser_show(app: AppHandle, state: State<BrowserStore>, opts: ShowOptions) -> Result<()>
// ShowOptions { url: String, mode: Mode, bounds: Option<Bounds> }
// - If browser doesn't exist: create + reparent to target window
// - If exists: navigate to url, reparent to mode's window

#[tauri::command]
async fn browser_navigate(app: AppHandle, state: State<BrowserStore>, action: NavAction) -> Result<()>
// NavAction = Url(String) | Back | Forward | Reload
// Uses webview.navigate() for Url, injected history stack for Back/Forward, webview.eval("location.reload()") for Reload

#[tauri::command]
async fn browser_set_mode(app: AppHandle, state: State<BrowserStore>, mode: Mode, bounds: Option<Bounds>) -> Result<()>
// Mode = Docked | Floating | Pip
// Handles reparent + destination window create/show/hide

#[tauri::command]
async fn browser_close(app: AppHandle, state: State<BrowserStore>) -> Result<()>
// Destroys webview, closes float/pip windows, transitions to Idle
```

**Plus visibility helpers (used for modal overlay suppression):**

```rust
#[tauri::command]
async fn browser_suppress(app: AppHandle, state: State<BrowserStore>) -> Result<()>  // hide
#[tauri::command]
async fn browser_unsuppress(app: AppHandle, state: State<BrowserStore>) -> Result<()>  // show + re-sync bounds if docked
```

**Events emitted from Rust:**

- `browser://state-changed` — `{ state: BrowserState }` — authoritative state for React to consume
- `browser://url-changed` — `{ url: String }` — from `on_navigation`
- `browser://page-loaded` — `{ url: String }` — from `on_page_load` with `Finished`
- `browser://nav-error` — `{ url: String, message: String }` — from `on_navigation` fail or injected `window.onerror`
- `browser://history-changed` — `{ canGoBack: bool, canGoForward: bool }` — tracked Rust-side

---

## React Layer

### Context: `BrowserPanelProvider`

Centralizes browser state subscribed from Rust events. Replaces ad-hoc state in `app.tsx`.

```tsx
interface BrowserPanelContextValue {
  state: BrowserState           // from browser://state-changed
  url: string | null
  canGoBack: boolean
  canGoForward: boolean
  mode: Mode
  error: string | null
  open: (url: string) => Promise<void>
  close: () => Promise<void>
  setMode: (mode: Mode) => Promise<void>
  navigate: (url: string) => Promise<void>
  back: () => Promise<void>
  forward: () => Promise<void>
  reload: () => Promise<void>
}
```

Provider subscribes to all `browser://*` events on mount and forwards to a reducer.

### Context: `BrowserOverlayContext`

Solves the modal z-order problem. Counter-based lock.

```tsx
interface BrowserOverlayContextValue {
  acquire: () => void   // increments counter; if 1, calls browser_suppress
  release: () => void   // decrements; if 0, calls browser_unsuppress
}

function useBrowserOverlayLock(active: boolean) {
  const { acquire, release } = useBrowserOverlayContext()
  useEffect(() => {
    if (!active) return
    acquire()
    return release
  }, [active])
}
```

**Wiring**: Wrap the shadcn `Dialog`, `Sheet`, `Popover`, `Tooltip`, `DropdownMenu`, and `CommandDialog` primitives in `src/openacp/components/ui/` so that they call `useBrowserOverlayLock(open)` internally. Consumers don't need to change.

### `BrowserPanel` component

Simplified from current implementation:
- No more `webviewReady` boolean — subscribe to `state` from context.
- No more manual `ResizeObserver` firing `browser_set_bounds` — use `auto_resize` on Rust side for window resize; only send bounds on **panel-drag-resize** (the resize handle on the left edge).
- No more hardcoded 250ms `setTimeout` for init — Rust emits `state-changed: Docked` when truly ready.
- Toolbar: Back, Forward, Reload, URL input, mode selector (dropdown: Docked/Floating/PiP), Open External, Close.
- Error state: full-panel card with error message, Retry button, "Open in system browser" button.
- Loading state: subtle top-bar progress indicator instead of full "Loading..." overlay.

---

## Resize Smoothness Strategy

### Case 1: Main window resize/maximize/fullscreen

Use Tauri's built-in `WebviewBuilder::auto_resize()`. The webview automatically tracks the parent window's size changes with native performance — no IPC per frame. This handles ~90% of resize scenarios.

**Caveat**: `auto_resize` assumes the webview fills the window. Since our docked webview occupies a sub-region, we combine it with a `Window::on_resize` handler that recomputes the panel bounds and calls `set_size`/`set_position` once per resize tick (throttled on the main thread, not per frame).

### Case 2: Panel drag resize (left-edge resize handle)

Three-phase approach:

1. **On drag start** (`ResizeHandle.onResizeStart`): call `browser_suppress()` to hide the webview. Show a placeholder div inside the container with matching border, bg, and a soft "resizing..." shimmer.
2. **During drag**: update CSS `width` of the panel container locally at 60 FPS (no IPC, no native calls).
3. **On drag end** (`ResizeHandle.onResizeEnd`): call `browser_set_mode(Docked, new_bounds)` which internally calls `set_size` + `set_position` + `browser_unsuppress()`. User sees webview reappear at the final position.

This trades "blank" during drag for zero-lag final state. Matches the pattern used by Raycast and similar apps.

---

## Modal Overlay Handling

### The problem

Radix Dialog renders a fixed-position backdrop + centered card over the entire viewport. The card and backdrop are HTML, which cannot render above the Tauri child webview. Result: dialog looks broken — backdrop dim is visible outside the browser area, card is visible outside the browser area, but everything inside the browser area is the browser content.

### Solution

`BrowserOverlayContext` with counter-based lock. When any overlay opens, the browser is suppressed (`browser_suppress` → `webview.hide()`). When all overlays close, the browser is restored (`browser_unsuppress` → `webview.show()` + bounds re-sync if docked).

**Primitives wrapped** (in `src/openacp/components/ui/`):
- `Dialog` (shadcn) — wrap `DialogContent` / track `open` state
- `Sheet` — same
- `Popover` — wrap `PopoverContent`
- `Tooltip` — wrap `TooltipContent` — **opt-out for small inline tooltips** (performance: hide/show cycle for a 200ms tooltip hover is not worth it). Only lock if tooltip bounds overlap the browser area (optional optimization for v2).
- `DropdownMenu` — wrap content
- `CommandDialog` (command palette) — wrap
- Custom modals in `src/openacp/components/` that use raw `fixed` positioning — audit and wrap manually

**Not wrapped**:
- Toasts (they don't visually conflict; positioned in a corner)
- Titlebar dropdowns that are outside the panel area

### Performance

`browser_suppress` / `browser_unsuppress` are cheap — they call `webview.hide()` / `webview.show()` synchronously in Rust. No layout thrash. The visual "flash" when a modal opens is ~30-50ms which is below perceptual threshold for modal transitions.

---

## Navigation & History

### Current problem

`handleBack` calls `invoke("browser_eval", { js: "history.back()" })`. This is fragile:
- SPA routers can `preventDefault` popstate
- No feedback on whether back actually happened
- React doesn't know the current URL after internal navigation
- Address bar stays showing the original URL after SPA nav

### New approach: Rust-authoritative history stack

**In Rust**, track a per-browser history stack:

```rust
struct BrowserHistory {
    entries: Vec<String>,
    cursor: usize,  // current position in entries
}
```

**Update via `on_navigation`**: when the Rust navigation handler fires for a new URL:
- If `NavAction::Url(url)` triggered it: push new entry, move cursor forward
- If `NavAction::Back` / `Forward`: just move cursor (don't push)
- If webview-internal navigation (user clicked a link inside the webview): detect via `on_navigation`'s cause + stack compare, push new entry

After each update, emit `browser://url-changed` + `browser://history-changed { canGoBack, canGoForward }`.

**Back/Forward from React**:
- `navigate({ action: "Back" })` — Rust checks stack, if can go back: `webview.navigate(entries[cursor - 1])`, updates cursor
- Same for Forward
- Rust is source of truth; `eval("history.back()")` is not used at all

**Address bar**: React displays `context.url` from events, always in sync with actual webview location.

**Injected init script** helps detect SPA navigation (hashchange, pushState, popstate):

```js
// initialization_script, injected via WebviewBuilder::initialization_script
(function() {
  function notify() {
    window.__TAURI__.event.emit('browser-nav-internal', { url: location.href });
  }
  const origPush = history.pushState;
  history.pushState = function(...args) { origPush.apply(this, args); notify(); };
  const origReplace = history.replaceState;
  history.replaceState = function(...args) { origReplace.apply(this, args); notify(); };
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
})();
```

Rust listens for `browser-nav-internal` from the browser webview specifically and updates history.

---

## Error Handling & Crash Recovery

### Navigation errors

**Detection**:
- `on_navigation` returns the URL that Tauri is about to navigate to — cannot detect network errors directly.
- Inject `window.addEventListener('error', ...)` via `initialization_script` → `emit('browser-error', { message, url })`.
- Inject a `fetch` / `XMLHttpRequest` wrapper to catch network-level failures.
- Check `document.readyState` after `on_page_load` Finished — if it didn't actually load, surface error.
- Listen to `did-fail-load` if exposed (Tauri may not expose this directly; use page-load timeout fallback: if `Started` fires but `Finished` doesn't within 15s, treat as error).

**Surfacing**: Rust emits `browser://nav-error` → React sets `error` in context → `BrowserPanel` renders error card:

```
┌─────────────────────────────┐
│  ⚠ Failed to load           │
│                             │
│  https://example.com        │
│  Error: net::ERR_CONNECTION_│
│  REFUSED                    │
│                             │
│  [ Retry ] [ Open externally]│
└─────────────────────────────┘
```

### Webview crashes

Rare but possible (WKWebView/WebView2 can crash). Detection is platform-specific and not directly exposed by Tauri. Workaround:
- Periodic heartbeat ping via `webview.eval("window.__browserAlive = true")` every 30s
- If eval fails for 2 consecutive attempts: emit `browser://crashed` → React shows crash UI with Reload button
- Reload = destroy + recreate webview at last known URL

This is best-effort — full crash detection is not feasible on Tauri 2.

### Invalid URL input

`handleNavigate` input validation:
- Trim whitespace
- If starts with `http://` or `https://`: pass through
- Otherwise: check if it looks like a domain (has `.` and no spaces) → prepend `https://`
- If it's just text: treat as Google search query, navigate to `https://www.google.com/search?q=<encoded>`
- On `url.parse::<Url>()` failure in Rust: emit `browser://nav-error` with "Invalid URL"

---

## Lifecycle Edge Cases

| Scenario | Handling |
|---|---|
| Open while Closing | Queue the open; execute when Closing → Idle |
| Close while Opening | Set cancel flag in Opening state; when Opening completes, immediately transition to Closing |
| Open while already Docked | Navigate to new URL instead of recreate |
| Workspace switch with browser open | Auto-close (destroy webview); remember last URL per workspace if user wants (D9: out of scope for v1) |
| Main window minimize | No action needed — Tauri handles visibility |
| Main window restore | Re-sync docked bounds (`browser_set_mode(Docked, bounds)`) |
| Main window fullscreen | `auto_resize` handles it; bounds recompute on resize tick |
| Rapid mode toggles | Latest wins; state machine serializes transitions, skipping intermediate states |
| URL change while Navigating | Cancel previous, start new |
| App quit while browser open | Close cleanly (destroy webview, close float/pip windows) in `WindowEvent::CloseRequested` |
| Workspace switch while Opening | Cancel Opening → close immediately |
| Modal opens while browser in error state | Still suppress — consistent UX |
| User closes panel while modal is locked (suppress count > 0) | Force-release locks, destroy browser |

---

## Three Modes — Specifications

### Docked

- **Parent window**: `main`
- **Position/size**: computed from the panel's `containerRef.getBoundingClientRect()`
- **Auto-resize**: `WebviewBuilder::auto_resize()` enabled for natural window-resize tracking
- **Panel drag resize**: suppress → CSS-only drag → unsuppress + set_size
- **Animation**: Framer Motion `width: 0 → auto` (existing behavior preserved) — webview hidden during animation (250ms), unsuppressed on animation end via `onAnimationComplete`
- **Z-order**: suppress on modal open (via overlay context)

### Floating

- **Parent window**: new `WebviewWindow` with label `browser-float`
- **Config**: `inner_size(800, 600)`, `resizable(true)`, `decorations(true)`, `always_on_top(false)` (detached — user manages focus)
- **Position**: remembered via `tauri-plugin-window-state` if available, else centered on main window
- **State preservation**: `webview.reparent(float_window)` — no recreate
- **Close behavior**: clicking float window's native close button → Rust emits close event → React transitions state to Idle, destroys webview
- **No z-order issues**: it's a sibling window; modals in main are unaffected

### PiP

- **Parent window**: new `WebviewWindow` with label `browser-pip`
- **Config**: `inner_size(380, 240)`, `resizable(true)` (min 280×180, max 800×600), `decorations(false)`, `always_on_top(true)`, `skip_taskbar(true)`
- **Position**: bottom-right of primary monitor by default; remember last position
- **Custom chrome**: minimal drag region at top (10px tall) + close button in top-right + URL label on hover
  - Since the PiP window runs the target website's content, we can't inject HTML chrome into the webview itself
  - Option A: small chrome bar OUTSIDE the webview is impossible (it IS the webview)
  - Option B: inject chrome HTML via `initialization_script` as a floating overlay on the page (risky — CSP, site-specific layout breakage)
  - **Decision**: Use native decorations for PiP v1 (`decorations: true`, small title bar) but with a custom title. Borderless PiP is a v2 improvement.
- **State preservation**: same `reparent` mechanism

### Mode persistence

Last-used mode stored in settings (`settings-store.ts`): `browserLastMode: "docked" | "floating" | "pip"`. On next `browser_open`, start in the last-used mode (unless the specific open call requests a different mode).

---

## Settings

New settings in `settings-store.ts`:

```ts
interface Settings {
  // ... existing ...
  browserPanel: boolean                              // existing — master toggle
  browserLastMode: "docked" | "floating" | "pip"     // new — default "docked"
  browserFloatingBounds: { x: number; y: number; width: number; height: number } | null  // new
  browserPipBounds: { x: number; y: number; width: number; height: number } | null  // new
  browserSearchEngine: "google" | "duckduckgo" | "bing"  // new — for address bar search fallback, default "google"
}
```

UI in `settings-general.tsx` — browser panel section gets expanded with mode default + search engine.

---

## Files Touched

### Rust (src-tauri)

- `src-tauri/src/core/browser.rs` — **full rewrite**
  - New: `BrowserState` enum, `BrowserStore` (`Mutex<BrowserState>`)
  - New: 4 primary commands + 2 suppress helpers
  - New: `on_navigation`, `on_page_load`, `initialization_script` wired in builder
  - New: internal history stack tracking
  - New: event emitters
- `src-tauri/src/core/mod.rs` — no change (module already declared)
- `src-tauri/src/lib.rs` — update command registrations (remove 8 old, add new)
- `src-tauri/Cargo.toml` — confirm `features = ["unstable"]` (already set)
- `src-tauri/capabilities/default.json` — add any new capability permissions needed

### React (src/openacp)

- `src/openacp/components/browser-panel.tsx` — **significant rewrite**
  - Remove `syncBounds`, `ResizeObserver` per-frame, hardcoded timeouts
  - Subscribe to `BrowserPanelContext`
  - Add error state UI + mode selector dropdown
  - Add placeholder during drag-resize
- `src/openacp/context/browser-panel.tsx` — **NEW**
  - Provider + context + event subscriptions
  - Calls Rust commands
  - Manages reducer for `{ state, url, canGoBack, canGoForward, mode, error }`
- `src/openacp/context/browser-overlay.tsx` — **NEW**
  - Counter-based lock context
  - `acquire` / `release` / `useBrowserOverlayLock(active)` hook
- `src/openacp/app.tsx` — wire `BrowserPanelProvider` + `BrowserOverlayContext` near app root; simplify browser state management
- `src/openacp/main.tsx` — no change to link interceptor (keeps working)
- `src/openacp/components/ui/dialog.tsx` — add `useBrowserOverlayLock(open)` inside `DialogContent`
- `src/openacp/components/ui/sheet.tsx` — same
- `src/openacp/components/ui/popover.tsx` — same
- `src/openacp/components/ui/dropdown-menu.tsx` — same (wrap `DropdownMenuContent`)
- `src/openacp/components/ui/tooltip.tsx` — same, but with opt-out flag
- `src/openacp/components/command-palette.tsx` — add lock if it uses a Dialog wrapper; verify
- `src/openacp/components/ui/resize-handle.tsx` — add `onResizeStart` / `onResizeEnd` callbacks if not present
- `src/openacp/lib/settings-store.ts` — add new browser settings fields
- `src/openacp/components/settings/settings-general.tsx` — expand browser section

### Phases / commit granularity

One PR, but commits are split per phase so reviewer can step through:

**Phase 1 — Rust foundation (stabilization core)**
- Commit 1: Add state machine, rewrite Rust commands with events, add `initialization_script` + `on_navigation` + `on_page_load` handlers, add history stack
- Commit 2: Update `lib.rs` registrations and capabilities

**Phase 2 — React context layer**
- Commit 3: Add `BrowserPanelContext` + event subscriptions + reducer
- Commit 4: Add `BrowserOverlayContext` + lock hook

**Phase 3 — Modal overlay integration**
- Commit 5: Wrap `Dialog`, `Sheet`, `Popover`, `DropdownMenu`, `Tooltip` primitives with overlay lock
- Commit 6: Audit and update custom modals in `components/`

**Phase 4 — Browser panel UI rewrite**
- Commit 7: Rewrite `browser-panel.tsx` to use context, remove manual sync, add placeholder drag
- Commit 8: Add error state UI + mode selector

**Phase 5 — Modes (Docked/Floating/PiP)**
- Commit 9: Implement docked mode properly with `auto_resize` and resize handling
- Commit 10: Floating mode with reparent
- Commit 11: PiP mode with reparent + window config
- Commit 12: Mode persistence in settings

**Phase 6 — Lifecycle & edge cases**
- Commit 13: Workspace switch handling, app quit cleanup, crash heartbeat
- Commit 14: Open/close race conditions, rapid toggle handling

**Phase 7 — Polish**
- Commit 15: Loading indicator, URL validation + search fallback, "open externally" polish
- Commit 16: Settings UI for new browser options

---

## Open Risks

1. **`unstable` feature regression**: Tauri may break `add_child` / `reparent` in a minor version bump. Mitigation: the command API (`browser_show`, `browser_navigate`, `browser_set_mode`, `browser_close`) is a stable abstraction — if we need to pivot to sibling WebviewWindow (research's Option A), only the Rust implementation changes, React side is untouched.

2. **Reparent on macOS behavior**: unverified whether `reparent` preserves scroll position across windows. Need to test during implementation; if scroll resets, fall back to manual `scrollY` save/restore via eval.

3. **`auto_resize` + sub-region**: `auto_resize` is designed for fullscreen webviews. Using it for a sub-region of the main window may not work as expected. Fallback: manual resize on `Window::on_resize` tick (throttled).

4. **Modal lock counter leaks**: if a component unmounts while holding a lock without `release`, counter stays elevated and browser is permanently hidden. Mitigation: `useBrowserOverlayLock` uses useEffect cleanup, which handles unmount. Additionally, expose a debug `resetLock()` for recovery.

5. **PiP chrome**: native window decorations on PiP v1 is a compromise. If users ask for borderless + custom controls, that's v2 work (requires injection-based chrome or a separate UI WebviewWindow overlay).

6. **Linux Wayland**: `add_child` is unsupported. Detection: check platform on startup, disable docked mode on Wayland, default to floating mode, or fall back to system browser entirely.

---

## Testing Strategy

No existing test framework. Manual test checklist to verify:

- [ ] Open browser from chat link → shows docked
- [ ] Resize panel (drag handle) → webview repositions correctly, no lag
- [ ] Resize main window → webview follows smoothly
- [ ] Maximize main window → webview scales
- [ ] Open Dialog while browser open → modal visible correctly (browser suppressed)
- [ ] Close Dialog → browser visible again at correct bounds
- [ ] Open Popover over browser → suppressed
- [ ] Switch to Floating → webview moves to new window, URL preserved
- [ ] Switch Floating → PiP → window shrinks, URL preserved
- [ ] Switch PiP → Docked → webview back in panel, URL preserved
- [ ] Back/Forward buttons → history navigation works, disabled state correct
- [ ] Invalid URL input → navigates to Google search
- [ ] Navigation error (`https://thisdomaindoesntexist.invalid`) → error UI with retry
- [ ] Retry after error → loads if valid
- [ ] Close panel → webview destroyed, no leaks
- [ ] Rapid toggle (open/close 10× fast) → no orphan webviews, no crashes
- [ ] Workspace switch with browser open → auto-closes
- [ ] App quit with browser open → clean shutdown, no zombie windows
- [ ] Mode persistence → last-used mode remembered across app restart

---

## Appendix: Command Migration Table

| Current command | New command / handling |
|---|---|
| `browser_open(url, x, y, w, h)` | `browser_show({ url, mode: Docked, bounds: {...} })` |
| `browser_navigate(url)` | `browser_navigate({ action: Url(url) })` |
| `browser_eval(js)` | Removed — back/forward/reload become proper actions |
| `browser_close()` | `browser_close()` (unchanged name) |
| `browser_set_bounds(x, y, w, h)` | `browser_set_mode({ mode: Docked, bounds: {...} })` |
| `browser_show()` | `browser_unsuppress()` |
| `browser_hide()` | `browser_suppress()` |
| `browser_float(url)` | `browser_set_mode({ mode: Floating })` |
| `browser_dock(url, x, y, w, h)` | `browser_set_mode({ mode: Docked, bounds: {...} })` |
