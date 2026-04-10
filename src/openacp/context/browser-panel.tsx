import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { setSetting } from "../lib/settings-store"

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
      // On Idle, clear url — otherwise stale URLs (including any accidentally
      // captured "about:blank") persist and the titlebar toggle tries to
      // reopen them, which Rust's parse_url rejects.
      const url =
        s.kind === "idle"
          ? null
          : s.kind === "navigating"
            ? s.to ?? state.url
            : s.url ?? state.url
      // On Idle, also reset mode to "docked" — otherwise a stale "floating"
      // or "pip" mode persists and the next browser.show() opens the wrong
      // UI (e.g. FloatingBrowserFrame renders with no webview → user stuck).
      const mode = s.kind === "idle" ? "docked" : (s.mode ?? state.mode)
      return {
        ...state,
        kind: s.kind,
        url,
        mode,
        canGoBack: action.payload.can_go_back,
        canGoForward: action.payload.can_go_forward,
        suppressed: action.payload.suppressed,
        error: s.kind === "error" ? s.message ?? "Unknown error" : null,
      }
    }
    case "url-changed":
      // Filter out non-http(s) URLs defensively. Rust on_navigation already
      // skips these, but belt-and-suspenders — if any leak through, don't
      // corrupt the address bar state.
      if (!/^https?:\/\//i.test(action.url)) return state
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

  useEffect(() => {
    let active = true
    let unlisten: UnlistenFn[] = []

    async function wire() {
      const fns = await Promise.all([
        listen<BrowserStateChangedPayload>("browser://state-changed", (e) => {
          if (!active) return
          dispatch({ type: "state-changed", payload: e.payload })
        }),
        listen<{ url: string }>("browser://url-changed", (e) => {
          if (!active) return
          dispatch({ type: "url-changed", url: e.payload.url })
        }),
        listen<{ url: string; message: string }>("browser://nav-error", (e) => {
          if (!active) return
          dispatch({
            type: "nav-error",
            url: e.payload.url,
            message: e.payload.message,
          })
        }),
      ])
      if (!active) {
        fns.forEach((u) => u())
      } else {
        unlisten = fns
      }
    }

    void wire()
    return () => {
      active = false
      unlisten.forEach((u) => u())
    }
  }, [])

  const open = useCallback(
    async (url: string, bounds?: BrowserBounds, mode: BrowserMode = "docked") => {
      dispatch({ type: "set-visible", value: true })
      dispatch({ type: "clear-error" })
      try {
        await invoke("browser_show", { opts: { url, mode, bounds: bounds ?? null } })
      } catch (e) {
        dispatch({ type: "set-visible", value: false })
        throw e
      }
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
      setSetting("browserLastMode", mode).catch(() => {})
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
