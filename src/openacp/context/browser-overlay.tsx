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
