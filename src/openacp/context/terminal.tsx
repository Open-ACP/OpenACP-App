import React, { createContext, useContext, useState, useCallback, useRef } from "react"
import { getPtyBackend, type PtyBackend } from "../lib/pty-backend"

/** A single PTY-backed pane. */
export interface TerminalLeaf {
  type: "leaf"
  /** The PTY session id returned by the backend — also the DOM key for the renderer. */
  sessionId: string
}

/**
 * A split container. `direction` describes how the two children are laid out:
 * - `horizontal` — side by side (left | right)
 * - `vertical`   — stacked (top / bottom)
 * `ratio` is the fraction of available space assigned to `a` (0..1).
 */
export interface TerminalSplit {
  type: "split"
  direction: "horizontal" | "vertical"
  ratio: number
  a: TerminalNode
  b: TerminalNode
}

export type TerminalNode = TerminalLeaf | TerminalSplit

export interface TerminalTab {
  id: string
  title: string
  root: TerminalNode
  /** Session id of the focused leaf within this tab. */
  activeLeaf: string
}

interface TerminalContextValue {
  tabs: TerminalTab[]
  activeTabId: string | null
  backend: PtyBackend

  /** Create a new tab with a single leaf rooted at `cwd`. Returns the tab id. */
  openTab: (cwd: string) => Promise<string>
  /** Close a tab and all PTYs inside it. */
  closeTab: (tabId: string) => Promise<void>
  setActiveTab: (id: string | null) => void

  /** Split the currently focused leaf in the active tab. */
  splitActive: (direction: "horizontal" | "vertical", cwd?: string) => Promise<void>
  /** Close a specific leaf. Collapses the parent split or removes the tab if it was the last leaf. */
  closeLeaf: (sessionId: string) => Promise<void>
  /** Focus a leaf within its tab. */
  setActiveLeaf: (sessionId: string) => void
  /** Update the ratio of the split that contains this leaf boundary. */
  setSplitRatio: (splitPath: number[], ratio: number) => void
}

const TerminalContext = createContext<TerminalContextValue | null>(null)

function collectLeafIds(node: TerminalNode, out: string[] = []): string[] {
  if (node.type === "leaf") {
    out.push(node.sessionId)
    return out
  }
  collectLeafIds(node.a, out)
  collectLeafIds(node.b, out)
  return out
}

/**
 * Walk a layout tree applying `transform` to each leaf. If `transform` returns
 * `null`, the leaf is removed; any split that loses a child collapses to the
 * surviving side (so single-child splits never exist).
 *
 * Returns the (possibly new) root, or `null` if every leaf was removed.
 */
function transformTree(
  node: TerminalNode,
  transform: (leaf: TerminalLeaf) => TerminalNode | null,
): TerminalNode | null {
  if (node.type === "leaf") return transform(node)
  const a = transformTree(node.a, transform)
  const b = transformTree(node.b, transform)
  if (!a && !b) return null
  if (!a) return b
  if (!b) return a
  // Reuse the object shape; React prop-equality will fall back to deep-ish checks.
  return { ...node, a, b }
}

/** Apply a mutation at a specific path. Used by setSplitRatio. */
function mutateAtPath(
  node: TerminalNode,
  path: number[],
  depth: number,
  mutate: (n: TerminalSplit) => TerminalSplit,
): TerminalNode {
  if (depth === path.length) {
    if (node.type !== "split") return node
    return mutate(node)
  }
  if (node.type !== "split") return node
  const step = path[depth]
  if (step === 0) return { ...node, a: mutateAtPath(node.a, path, depth + 1, mutate) }
  if (step === 1) return { ...node, b: mutateAtPath(node.b, path, depth + 1, mutate) }
  return node
}

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<TerminalTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const backendRef = useRef(getPtyBackend())
  const counterRef = useRef(0)

  const openTab = useCallback(async (cwd: string) => {
    const backend = backendRef.current
    const sessionId = await backend.create({ cwd })
    counterRef.current += 1
    const n = counterRef.current
    const tab: TerminalTab = {
      id: `tab_${n}`,
      title: `Terminal ${n}`,
      root: { type: "leaf", sessionId },
      activeLeaf: sessionId,
    }
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    return tab.id
  }, [])

  const closeTab = useCallback(async (tabId: string) => {
    const backend = backendRef.current
    setTabs((prev) => {
      const closing = prev.find((t) => t.id === tabId)
      if (closing) {
        for (const sid of collectLeafIds(closing.root)) {
          backend.close(sid).catch(() => {})
        }
      }
      const next = prev.filter((t) => t.id !== tabId)
      setActiveTabId((curr) => {
        if (curr !== tabId) return curr
        return next.length > 0 ? next[next.length - 1].id : null
      })
      return next
    })
  }, [])

  const splitActive = useCallback(async (direction: "horizontal" | "vertical", cwd?: string) => {
    const backend = backendRef.current
    // Snapshot the focus target synchronously so we can spawn the new PTY
    // before touching state (avoids flashing an empty pane).
    let targetLeafId: string | undefined
    let targetTabId: string | undefined
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === activeTabId)
      if (!tab) return prev
      targetTabId = tab.id
      targetLeafId = tab.activeLeaf
      return prev
    })
    const sessionId = await backend.create({ cwd: cwd ?? "" })
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== targetTabId) return tab
        const newLeaf: TerminalLeaf = { type: "leaf", sessionId }
        const nextRoot = transformTree(tab.root, (leaf) => {
          if (leaf.sessionId !== targetLeafId) return leaf
          const split: TerminalSplit = {
            type: "split",
            direction,
            ratio: 0.5,
            a: leaf,
            b: newLeaf,
          }
          return split
        })
        return { ...tab, root: nextRoot ?? tab.root, activeLeaf: sessionId }
      }),
    )
  }, [activeTabId])

  const closeLeaf = useCallback(async (sessionId: string) => {
    const backend = backendRef.current
    backend.close(sessionId).catch(() => {})
    setTabs((prev) => {
      const next: TerminalTab[] = []
      for (const tab of prev) {
        const nextRoot = transformTree(tab.root, (leaf) =>
          leaf.sessionId === sessionId ? null : leaf,
        )
        if (!nextRoot) continue
        // If the focused leaf was removed, fall back to any remaining leaf.
        const remaining = collectLeafIds(nextRoot)
        const activeLeaf = remaining.includes(tab.activeLeaf)
          ? tab.activeLeaf
          : remaining[0]
        next.push({ ...tab, root: nextRoot, activeLeaf })
      }
      // If the active tab disappeared entirely, pick another (or null).
      setActiveTabId((curr) => {
        if (curr && next.find((t) => t.id === curr)) return curr
        return next.length > 0 ? next[next.length - 1].id : null
      })
      return next
    })
  }, [])

  const setActiveLeaf = useCallback((sessionId: string) => {
    setTabs((prev) =>
      prev.map((tab) => {
        const ids = collectLeafIds(tab.root)
        if (!ids.includes(sessionId)) return tab
        return { ...tab, activeLeaf: sessionId }
      }),
    )
    // Also focus the tab that owns this leaf.
    setActiveTabId((curr) => {
      const owner = tabs.find((t) => collectLeafIds(t.root).includes(sessionId))
      return owner?.id ?? curr
    })
  }, [tabs])

  const setSplitRatio = useCallback((splitPath: number[], ratio: number) => {
    const clamped = Math.max(0.1, Math.min(0.9, ratio))
    setTabs((prev) =>
      prev.map((tab) => {
        if (tab.id !== activeTabId) return tab
        const nextRoot = mutateAtPath(tab.root, splitPath, 0, (split) => ({
          ...split,
          ratio: clamped,
        }))
        return { ...tab, root: nextRoot }
      }),
    )
  }, [activeTabId])

  return (
    <TerminalContext.Provider
      value={{
        tabs,
        activeTabId,
        backend: backendRef.current,
        openTab,
        closeTab,
        setActiveTab: setActiveTabId,
        splitActive,
        closeLeaf,
        setActiveLeaf,
        setSplitRatio,
      }}
    >
      {children}
    </TerminalContext.Provider>
  )
}

export function useTerminal() {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider")
  return ctx
}
