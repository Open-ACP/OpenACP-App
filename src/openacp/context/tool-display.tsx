import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { getSetting, setSetting } from "../lib/settings-store"

export const ALL_KINDS = ["read", "search", "edit", "write", "execute", "agent", "web", "skill", "other"] as const

/**
 * Preset configurations for tool auto-expand.
 * "important" expands only high-impact tool kinds; "all" expands everything; "none" collapses all.
 */
export const TOOL_EXPAND_PRESETS: Record<"all" | "important" | "none", Record<string, boolean>> = {
  all: Object.fromEntries(ALL_KINDS.map((k) => [k, true])),
  important: {
    read: false,
    search: false,
    edit: true,
    write: true,
    execute: true,
    agent: true,
    web: false,
    skill: false,
    other: false,
  },
  none: Object.fromEntries(ALL_KINDS.map((k) => [k, false])),
}

/**
 * Returns the matching preset name if the value exactly matches one of the three presets,
 * or null if it is a custom configuration.
 *
 * Treats missing keys as false to match shouldAutoExpand's ?? false fallback,
 * so partial stored objects (e.g. from an older app version) still match presets correctly.
 */
export function detectPreset(value: Record<string, boolean>): "all" | "important" | "none" | null {
  for (const [name, preset] of Object.entries(TOOL_EXPAND_PRESETS) as ["all" | "important" | "none", Record<string, boolean>][]) {
    if (ALL_KINDS.every((k) => (value[k] ?? false) === preset[k])) return name
  }
  return null
}

interface ToolDisplayContextValue {
  /** Current per-kind auto-expand map */
  toolAutoExpand: Record<string, boolean>
  /** True once the persisted setting has been loaded from the store */
  isLoaded: boolean
  /** Returns true if a tool of the given kind should auto-expand its IN/OUT body on mount */
  shouldAutoExpand: (kind: string) => boolean
  /** Writes new value to both React state and the persistent settings store */
  updateToolAutoExpand: (value: Record<string, boolean>) => Promise<void>
}

const ToolDisplayContext = createContext<ToolDisplayContextValue | null>(null)

export function ToolDisplayProvider({ children }: { children: React.ReactNode }) {
  const [toolAutoExpand, setToolAutoExpand] = useState<Record<string, boolean>>(TOOL_EXPAND_PRESETS.important)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    void getSetting("toolAutoExpand").then((value) => {
      setToolAutoExpand(value)
      setIsLoaded(true)
    })
  }, [])

  const updateToolAutoExpand = useCallback(async (value: Record<string, boolean>) => {
    setToolAutoExpand(value)
    await setSetting("toolAutoExpand", value)
  }, [])

  const contextValue = useMemo(() => ({
    toolAutoExpand,
    isLoaded,
    shouldAutoExpand: (kind: string) => toolAutoExpand[kind] ?? false,
    updateToolAutoExpand,
  }), [toolAutoExpand, isLoaded, updateToolAutoExpand])

  return (
    <ToolDisplayContext.Provider value={contextValue}>
      {children}
    </ToolDisplayContext.Provider>
  )
}

/** Hook to access tool display settings and updater from any component in the tree. */
export function useToolDisplay(): ToolDisplayContextValue {
  const v = useContext(ToolDisplayContext)
  if (!v) throw new Error("useToolDisplay must be used within ToolDisplayProvider")
  return v
}
