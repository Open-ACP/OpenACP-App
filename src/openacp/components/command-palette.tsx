import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useChat } from "../context/chat"
import { useSessions } from "../context/sessions"
import { useWorkspace } from "../context/workspace"
import type { ServerCommand } from "../types"

// -- Platform-specific commands to hide --

const HIDDEN_COMMANDS = new Set([
  "tunnel", "tunnels", "usage", "summary", "archive", "clear",
  "tts", "text_to_speech", "enable_bypass", "disable_bypass",
  "resume", "integrate", "verbosity",
])

// Commands that have dedicated UI in the palette -- don't show as raw commands
const DEDICATED_COMMANDS = new Set([
  "mode", "model", "thought", "bypass_permissions",
  "new", "cancel", "close", "fork", "sessions", "status",
])

// -- Types --

interface PaletteItem {
  id: string
  label: string
  description?: string
  group: string
  rightLabel?: string
  type: "action" | "toggle" | "sub-picker"
  enabled?: boolean
  active?: boolean // for toggles
  action: () => void | Promise<void>
}

interface SubPickerState {
  title: string
  configId: string
  choices: { value: string; label: string; description?: string; current: boolean }[]
}

// -- Component --

export function CommandPalette({
  sessionID,
  onClose,
  onConfigChanged,
  initialFilter,
}: {
  sessionID: string | undefined
  onClose: () => void
  onConfigChanged?: () => void
  initialFilter?: string
}) {
  const chat = useChat()
  const sessions = useSessions()
  const workspace = useWorkspace()

  const [query, setQuery] = useState(initialFilter ?? "")
  const [subPicker, setSubPicker] = useState<SubPickerState | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const [serverCommands, setServerCommands] = useState<ServerCommand[]>([])
  const [sessionConfig, setSessionConfig] = useState<any>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // -- Mount: focus + click outside --
  useEffect(() => {
    inputRef.current?.focus()

    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid catching the click that opened the palette
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [onClose])

  // -- Fetch server commands --
  useEffect(() => {
    let cancelled = false
    workspace.client.getCommands().then((cmds) => {
      if (!cancelled) setServerCommands(cmds)
    }).catch(() => {
      if (!cancelled) setServerCommands([])
    })
    return () => { cancelled = true }
  }, [workspace.client])

  // -- Fetch config for toggles --
  useEffect(() => {
    if (!sessionID) { setSessionConfig(null); return }
    let cancelled = false
    workspace.client.getSessionConfig(sessionID).then((cfg) => {
      if (!cancelled) setSessionConfig(cfg)
    }).catch(() => {
      if (!cancelled) setSessionConfig(null)
    })
    return () => { cancelled = true }
  }, [sessionID, workspace.client])

  // -- Build items --

  const hasSession = !!sessionID

  const execCmd = useCallback(async (name: string) => {
    const sid = sessionID
    onClose()
    if (!sid) return
    chat.addCommandResponse(sid, `/${name}`, "user")
    try {
      const res = await workspace.client.executeCommand(`/${name}`, sid)
      if (res.error) {
        chat.addCommandResponse(sid, `**Error:** ${res.error}`, "assistant")
      } else if (res.result?.text) {
        chat.addCommandResponse(sid, res.result.text, "assistant")
      }
    } catch (e: any) {
      chat.addCommandResponse(sid, `**Error:** ${e?.message || "Command failed"}`, "assistant")
    }
  }, [sessionID, onClose, chat, workspace.client])

  const openConfigPicker = useCallback(async (category: string, title: string) => {
    if (!sessionID) return
    try {
      const config = await workspace.client.getSessionConfig(sessionID)
      const opt = config.configOptions?.find(
        (o: any) => o.category === category || o.id === category,
      )
      if (!opt || opt.type !== "select") return

      const choices: SubPickerState["choices"] = []
      for (const item of opt.options || []) {
        if ("options" in item && Array.isArray(item.options)) {
          for (const sub of item.options) {
            choices.push({
              value: sub.value,
              label: sub.label || sub.name || sub.value,
              description: sub.description,
              current: opt.currentValue === sub.value,
            })
          }
        } else {
          choices.push({
            value: item.value,
            label: item.label || item.name || item.value,
            description: item.description,
            current: opt.currentValue === item.value,
          })
        }
      }

      setSubPicker({ title, configId: opt.id, choices })
      setHighlighted(0)
    } catch { /* ignore */ }
  }, [sessionID, workspace.client])

  const selectConfigValue = useCallback(async (configId: string, value: string) => {
    if (!sessionID) return
    try {
      await workspace.client.setSessionConfig(sessionID, configId, value)
      onConfigChanged?.()
    } catch (e) {
      const { showToast } = await import("../lib/toast")
      showToast({ description: "Failed to set config", variant: "error" })
    }
    setSubPicker(null)
    onClose()
  }, [sessionID, workspace.client, onConfigChanged, onClose])

  const currentConfigValue = useCallback((category: string): string | undefined => {
    const config = sessionConfig
    if (!config) return undefined
    const opt = config.configOptions?.find(
      (o: any) => o.category === category || o.id === category,
    )
    if (!opt) return undefined
    if (opt.type === "select") {
      for (const item of opt.options || []) {
        if ("options" in item && Array.isArray(item.options)) {
          const found = item.options.find((s: any) => s.value === opt.currentValue)
          if (found) return found.label || found.name || found.value
        } else if (item.value === opt.currentValue) {
          return item.label || item.name || item.value
        }
      }
      return String(opt.currentValue)
    }
    return String(opt.currentValue)
  }, [sessionConfig])

  const items = useMemo((): PaletteItem[] => {
    const list: PaletteItem[] = []

    // Context
    list.push({ id: "attach", label: "Attach file...", group: "Context", type: "action", action: () => onClose() })
    list.push({ id: "mention", label: "Mention file...", group: "Context", type: "action", action: () => onClose() })
    list.push({
      id: "clear",
      label: "Clear conversation",
      group: "Context",
      type: "action",
      enabled: hasSession,
      action: () => { /* TODO: clear messages */ onClose() },
    })

    // Session
    list.push({
      id: "new-session",
      label: "New session",
      group: "Session",
      type: "action",
      action: async () => {
        const s = await sessions.create()
        if (s) chat.setActiveSession(s.id)
        else {
          const { showToast } = await import("../lib/toast")
          showToast({ description: "Failed to create session", variant: "error" })
        }
        onClose()
      },
    })
    list.push({
      id: "cancel",
      label: "Cancel prompt",
      group: "Session",
      type: "action",
      enabled: hasSession && chat.streaming(),
      action: () => { chat.abort(); onClose() },
    })
    list.push({
      id: "close-session",
      label: "Close session",
      group: "Session",
      type: "action",
      enabled: hasSession,
      action: async () => {
        if (sessionID) await sessions.remove(sessionID)
        onClose()
      },
    })

    // Configuration
    list.push({
      id: "cfg-mode",
      label: "Mode",
      group: "Configuration",
      type: "sub-picker",
      rightLabel: currentConfigValue("mode"),
      enabled: hasSession,
      action: () => openConfigPicker("mode", "Mode"),
    })
    list.push({
      id: "cfg-model",
      label: "Model",
      group: "Configuration",
      type: "sub-picker",
      rightLabel: currentConfigValue("model"),
      enabled: hasSession,
      action: () => openConfigPicker("model", "Model"),
    })
    // Server commands (dynamic)
    for (const cmd of serverCommands) {
      if (HIDDEN_COMMANDS.has(cmd.name)) continue
      if (DEDICATED_COMMANDS.has(cmd.name)) continue
      list.push({
        id: `cmd-${cmd.name}`,
        label: `/${cmd.name}`,
        description: cmd.description,
        group: "Commands",
        type: "action",
        enabled: hasSession || cmd.category === "system",
        action: () => execCmd(cmd.name),
      })
    }

    return list
  }, [hasSession, serverCommands, sessionConfig, onClose, sessions, chat, sessionID, currentConfigValue, openConfigPicker, execCmd])

  // -- Filtering --

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return items
    return items.filter((i) =>
      i.label.toLowerCase().includes(q) ||
      i.description?.toLowerCase().includes(q) ||
      i.group.toLowerCase().includes(q)
    )
  }, [query, items])

  const groups = useMemo(() => {
    const map = new Map<string, PaletteItem[]>()
    for (const item of filtered) {
      const list = map.get(item.group) ?? []
      list.push(item)
      map.set(item.group, list)
    }
    return Array.from(map.entries())
  }, [filtered])

  const flatFiltered = filtered

  // -- Keyboard navigation --

  function scrollHighlightedIntoView() {
    requestAnimationFrame(() => {
      rootRef.current?.querySelector("[data-highlighted]")?.scrollIntoView({ block: "nearest" })
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      if (subPicker) {
        setSubPicker(null)
        return
      }
      onClose()
      return
    }

    const list = subPicker ? subPicker.choices : flatFiltered
    const len = list.length

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((h) => (h + 1) % len)
      scrollHighlightedIntoView()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((h) => (h - 1 + len) % len)
      scrollHighlightedIntoView()
    } else if (e.key === "Enter") {
      e.preventDefault()
      const idx = highlighted
      if (subPicker) {
        const choice = subPicker.choices[idx]
        if (choice) selectConfigValue(subPicker.configId, choice.value)
      } else {
        const item = flatFiltered[idx]
        if (item && item.enabled !== false) item.action()
      }
    }
  }

  // -- Render: Sub-picker --

  function SubPickerView() {
    const sp = subPicker!
    return (
      <>
        <div className="px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
          <button
            className="text-icon-weak hover:text-icon-base transition-colors"
            onClick={() => setSubPicker(null)}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15.8337L6.66667 10.0003L12.5 4.16699" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-13-medium text-text-strong">{sp.title}</span>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {sp.choices.map((choice, index) => (
            <button
              key={choice.value}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${highlighted === index ? "bg-surface-raised-base-hover" : ""}`}
              data-highlighted={highlighted === index ? "" : undefined}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => selectConfigValue(sp.configId, choice.value)}
            >
              <span className="w-4 shrink-0 text-center">
                {choice.current && (
                  <span className="text-text-interactive-base" style={{ fontSize: "12px" }}>&#10003;</span>
                )}
              </span>
              <span
                style={{ fontSize: "12px", fontWeight: "500" }}
                className={choice.current ? "text-text-strong" : "text-text-base"}
              >
                {choice.label}
              </span>
              {choice.description && (
                <span className="text-text-weak truncate flex-1 min-w-0" style={{ fontSize: "10.5px" }}>{choice.description}</span>
              )}
            </button>
          ))}
        </div>
      </>
    )
  }

  // -- Render: Main --

  return (
    <div
      ref={rootRef}
      className="w-full rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha shadow-lg overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      {subPicker ? (
        <SubPickerView />
      ) : (
        <>
          {/* Search */}
          <div className="px-3 py-2 border-b border-border-weaker-base">
            <input
              ref={inputRef}
              type="text"
              placeholder="Filter actions..."
              className="w-full bg-transparent text-13-regular text-text-strong placeholder:text-text-weak focus:outline-none"
              value={query}
              onChange={(e) => { setQuery(e.currentTarget.value); setHighlighted(0) }}
            />
          </div>

          {/* Items */}
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-13-regular text-text-weak text-center">No actions found</div>
            )}

            {groups.map(([group, groupItems]) => (
              <div key={group}>
                <div className="px-3 py-1" style={{ fontSize: "11px", color: "var(--text-weaker)" }}>
                  {group}
                </div>
                {groupItems.map((item) => {
                  const globalIdx = flatFiltered.indexOf(item)
                  const disabled = item.enabled === false
                  return (
                    <button
                      key={item.id}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                        highlighted === globalIdx ? "bg-surface-raised-base-hover" : ""
                      } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
                      data-highlighted={highlighted === globalIdx ? "" : undefined}
                      onMouseEnter={() => !disabled && setHighlighted(globalIdx)}
                      onClick={() => !disabled && item.action()}
                      disabled={disabled}
                    >
                      <span className="text-13-medium text-text-strong flex-1 min-w-0">{item.label}</span>
                      {item.description && (
                        <span className="text-text-weak truncate" style={{ fontSize: "11px" }}>{item.description}</span>
                      )}
                      {item.rightLabel && (
                        <span className="text-text-weak" style={{ fontSize: "11px" }}>{item.rightLabel}</span>
                      )}
                      {item.type === "toggle" && (
                        <div
                          className="w-7 h-4 rounded-full relative transition-colors"
                          style={{ background: item.active ? "var(--surface-success-strong)" : "var(--surface-raised-base)" }}
                        >
                          <div
                            className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
                            style={{ transform: item.active ? "translateX(14px)" : "translateX(2px)" }}
                          />
                        </div>
                      )}
                      {item.type === "sub-picker" && (
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className="text-icon-weaker">
                          <path d="M7.5 4.16699L13.3333 10.0003L7.5 15.8337" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
