import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { CaretDown } from "@phosphor-icons/react"
import { useWorkspace } from "../context/workspace"

interface ConfigChoice {
  value: string
  label: string
  description?: string
}

interface ConfigData {
  id: string
  name: string
  currentValue: string
  choices: ConfigChoice[]
}

export function ConfigSelector({
  category,
  sessionID,
  onValueChange,
  refreshKey,
}: {
  category: "mode" | "model"
  sessionID: string | undefined
  onValueChange?: (value: string) => void
  refreshKey?: number
}) {
  const workspace = useWorkspace()
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<ConfigData | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const fetchConfig = useCallback(async () => {
    if (!sessionID) { setConfig(null); return }
    try {
      const res = await workspace.client.getSessionConfig(sessionID)
      const opt = res.configOptions?.find(
        (o: any) => o.category === category || o.id === category
      )
      if (!opt || opt.type !== "select") { setConfig(null); return }

      // Flatten grouped options
      const choices: ConfigChoice[] = []
      for (const item of opt.options || []) {
        if ("options" in item && Array.isArray(item.options)) {
          for (const sub of item.options) {
            choices.push({ value: sub.value, label: sub.label || sub.name || sub.value, description: sub.description })
          }
        } else {
          choices.push({ value: item.value, label: item.label || item.name || item.value, description: item.description })
        }
      }
      setConfig({ id: opt.id, name: opt.name, currentValue: opt.currentValue as string, choices })
    } catch {
      setConfig(null)
    }
  }, [sessionID, category, workspace.client])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig, refreshKey])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  const currentLabel = config
    ? (config.choices.find((ch) => ch.value === config.currentValue)?.label || config.currentValue)
    : category

  async function select(value: string) {
    if (!config || !sessionID) return
    try {
      await workspace.client.setSessionConfig(sessionID, config.id, value)
      await fetchConfig()
      onValueChange?.(value)
    } catch (e) {
      console.error(`Failed to set ${category}`, e)
    }
    setOpen(false)
  }

  if (!sessionID) return null

  return (
    <div ref={rootRef} className="relative">
      <button
        className="min-w-0 max-w-[160px] text-13-regular text-text-base capitalize flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-raised-base-hover transition-colors"
        onClick={() => { setOpen(!open); if (!open) fetchConfig() }}
      >
        <span className="truncate">{currentLabel}</span>
        <CaretDown size={12} className="shrink-0" />
      </button>

      {open && createPortal(
        <div className="fixed w-72 flex flex-col p-1 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 overflow-y-auto"
          style={(() => {
            const rect = rootRef.current?.getBoundingClientRect()
            if (!rect) return {}
            const pos: React.CSSProperties = { bottom: window.innerHeight - rect.top + 4 }
            if (category === "mode") {
              pos.right = window.innerWidth - rect.right
            } else {
              pos.left = rect.left
            }
            return pos
          })()}
        >
          <span className="block px-3 py-1 text-text-weaker" style={{ fontSize: "10px", lineHeight: "1.4", letterSpacing: "0.02em" }}>
            {category === "mode" ? "Modes" : (config?.name || category)}
          </span>
          {(config?.choices || []).map((choice) => {
            const isCurrent = choice.value === config?.currentValue
            return (
              <button
                key={choice.value}
                className="w-full flex items-start gap-2 px-3 py-1.5 rounded text-left hover:bg-surface-raised-base-hover"
                onClick={() => select(choice.value)}
              >
                <span className="w-4 shrink-0 text-center mt-px">
                  {isCurrent && (
                    <span className="text-text-interactive-base">&#10003;</span>
                  )}
                </span>
                <div className="flex flex-col min-w-0 flex-1">
                  <span
                    className={isCurrent ? "text-text-strong" : "text-text-base"}
                    style={{ fontSize: "12px", fontWeight: "500", lineHeight: "1.4" }}
                  >
                    {choice.label}
                  </span>
                  {choice.description && (
                    <span className="text-text-weak truncate" style={{ fontSize: "10.5px", lineHeight: "1.3" }}>{choice.description}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}
