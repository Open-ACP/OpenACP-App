import React, { createContext, useContext, useEffect, useState } from "react"
import { getSetting, setSetting } from "../lib/settings-store"

const ALL_KINDS = ["read", "search", "edit", "write", "execute", "agent", "web", "skill", "other"] as const

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
 */
export function detectPreset(value: Record<string, boolean>): "all" | "important" | "none" | null {
  for (const [name, preset] of Object.entries(TOOL_EXPAND_PRESETS) as ["all" | "important" | "none", Record<string, boolean>][]) {
    if (ALL_KINDS.every((k) => value[k] === preset[k])) return name
  }
  return null
}

interface ToolDisplayContextValue {
  /** Current per-kind auto-expand map */
  toolAutoExpand: Record<string, boolean>
  /** Returns true if a tool of the given kind should auto-expand its IN/OUT body on mount */
  shouldAutoExpand: (kind: string) => boolean
  /** Writes new value to both React state and the persistent settings store */
  updateToolAutoExpand: (value: Record<string, boolean>) => Promise<void>
}

const ToolDisplayContext = createContext<ToolDisplayContextValue>({
  toolAutoExpand: TOOL_EXPAND_PRESETS.important,
  shouldAutoExpand: (kind) => TOOL_EXPAND_PRESETS.important[kind] ?? false,
  updateToolAutoExpand: async () => {},
})

export function ToolDisplayProvider({ children }: { children: React.ReactNode }) {
  const [toolAutoExpand, setToolAutoExpand] = useState<Record<string, boolean>>(TOOL_EXPAND_PRESETS.important)

  useEffect(() => {
    void getSetting("toolAutoExpand").then(setToolAutoExpand)
  }, [])

  async function updateToolAutoExpand(value: Record<string, boolean>) {
    setToolAutoExpand(value)
    await setSetting("toolAutoExpand", value)
  }

  return (
    <ToolDisplayContext.Provider
      value={{
        toolAutoExpand,
        shouldAutoExpand: (kind) => toolAutoExpand[kind] ?? false,
        updateToolAutoExpand,
      }}
    >
      {children}
    </ToolDisplayContext.Provider>
  )
}

/** Hook to access tool display settings and updater from any component in the tree. */
export function useToolDisplay() {
  return useContext(ToolDisplayContext)
}
