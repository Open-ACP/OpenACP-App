import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useChat } from "../context/chat"
import { useSessions } from "../context/sessions"
import { useWorkspace } from "../context/workspace"
import { useBrowserOverlayLock } from "../context/browser-overlay"
import { showToast } from "../lib/toast"
import type { ServerCommand } from "../types"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

const HIDDEN_COMMANDS = new Set([
  "tunnel", "tunnels", "usage", "summary", "archive", "clear",
  "tts", "text_to_speech", "enable_bypass", "disable_bypass",
  "resume", "integrate", "verbosity",
])

const DEDICATED_COMMANDS = new Set([
  "mode", "model", "thought", "bypass_permissions",
  "new", "cancel", "close", "fork", "sessions", "status",
])

interface PaletteItem {
  id: string; label: string; description?: string; group: string
  rightLabel?: string; type: "action" | "toggle" | "sub-picker"
  enabled?: boolean; active?: boolean; action: () => void | Promise<void>
}

interface SubPickerState {
  title: string; configId: string
  choices: { value: string; label: string; description?: string; current: boolean }[]
}

export function CommandPalette(props: {
  sessionID: string | undefined; onClose: () => void
  onConfigChanged?: () => void; initialFilter?: string
  /** Fill composer with command text instead of executing immediately */
  onFill?: (text: string) => void
  /** Ref to imperative navigation so parent can forward arrow keys */
  navigateRef?: React.RefObject<((dir: 'up' | 'down' | 'enter') => void) | null>
}) {
  const chat = useChat()
  const sessions = useSessions()
  const workspace = useWorkspace()

  // CommandPalette is only rendered when open by its parent, so we always
  // hold the browser overlay lock for the lifetime of this component.
  useBrowserOverlayLock(true)

  const [query, setQuery] = useState(props.initialFilter ?? "")
  const [subPicker, setSubPicker] = useState<SubPickerState | null>(null)
  const [highlighted, setHighlighted] = useState(0)
  const [serverCommands, setServerCommands] = useState<ServerCommand[]>([])
  const [sessionConfig, setSessionConfig] = useState<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Click outside
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) props.onClose()
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handle), 0)
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handle) }
  }, [props.onClose])

  // Fetch commands + config
  useEffect(() => {
    workspace.client.getCommands().then(setServerCommands).catch(() => setServerCommands([]))
  }, [workspace.client])

  useEffect(() => {
    if (!props.sessionID) return
    workspace.client.getSessionConfig(props.sessionID).then(setSessionConfig).catch(() => setSessionConfig(null))
  }, [props.sessionID, workspace.client])

  const hasSession = !!props.sessionID

  async function execCmd(name: string, usage?: string) {
    // Commands with arguments: fill composer so user can type args before sending.
    // onFill handles closing the palette itself — do not call onClose here.
    if (usage && props.onFill) {
      props.onFill(`/${name} `)
      return
    }

    const sid = props.sessionID
    props.onClose()
    if (!sid) return
    chat.addCommandResponse(sid, `/${name}`, "user")
    try {
      const res = await workspace.client.executeCommand(`/${name}`, sid)
      if (res.error) {
        chat.addCommandResponse(sid, `**Error:** ${res.error}`, "assistant")
      } else if (res.result?.type === 'adaptive') {
        const variant = res.result.variants?.['sse'] as { text?: string } | undefined
        chat.addCommandResponse(sid, variant?.text ?? res.result.fallback, "assistant")
      } else if (res.result?.type === 'error') {
        chat.addCommandResponse(sid, `⚠️ ${res.result.message}`, "assistant")
      } else if (res.result?.text) {
        chat.addCommandResponse(sid, res.result.text, "assistant")
      }
    } catch (e: any) {
      chat.addCommandResponse(sid, `**Error:** ${e?.message || "Command failed"}`, "assistant")
    }
  }

  async function openConfigPicker(category: string, title: string) {
    if (!props.sessionID) return
    try {
      const config = await workspace.client.getSessionConfig(props.sessionID)
      const opt = config.configOptions?.find((o: any) => o.category === category || o.id === category)
      if (!opt || opt.type !== "select") return
      const choices: SubPickerState["choices"] = []
      for (const item of opt.options || []) {
        if ("options" in item && Array.isArray(item.options)) {
          for (const sub of item.options) {
            choices.push({ value: sub.value, label: sub.label || sub.name || sub.value, description: sub.description, current: opt.currentValue === sub.value })
          }
        } else {
          choices.push({ value: item.value, label: item.label || item.name || item.value, description: item.description, current: opt.currentValue === item.value })
        }
      }
      setSubPicker({ title, configId: opt.id, choices })
      setHighlighted(0)
    } catch {}
  }

  async function selectConfigValue(configId: string, value: string) {
    if (!props.sessionID) return
    try {
      await workspace.client.setSessionConfig(props.sessionID, configId, value)
      props.onConfigChanged?.()
    } catch {
      showToast({ description: "Failed to set config", variant: "error" })
    }
    setSubPicker(null)
    props.onClose()
  }

  const currentConfigValue = useCallback((category: string): string | undefined => {
    if (!sessionConfig) return undefined
    const opt = sessionConfig.configOptions?.find((o: any) => o.category === category || o.id === category)
    if (!opt) return undefined
    if (opt.type === "select") {
      for (const item of opt.options || []) {
        if ("options" in item && Array.isArray(item.options)) {
          const found = item.options.find((s: any) => s.value === opt.currentValue)
          if (found) return found.label || found.name || found.value
        } else if (item.value === opt.currentValue) return item.label || item.name || item.value
      }
      return String(opt.currentValue)
    }
    return String(opt.currentValue)
  }, [sessionConfig])

  const items = useMemo((): PaletteItem[] => {
    const list: PaletteItem[] = []
    list.push({ id: "attach", label: "Attach file...", group: "Context", type: "action", action: () => props.onClose() })
    list.push({ id: "mention", label: "Mention file...", group: "Context", type: "action", action: () => props.onClose() })
    list.push({ id: "clear", label: "Clear conversation", group: "Context", type: "action", enabled: hasSession, action: () => props.onClose() })
    list.push({
      id: "new-session", label: "New session", group: "Session", type: "action",
      action: async () => { const s = await sessions.create(); if (s) chat.setActiveSession(s.id); else showToast({ description: "Failed to create session", variant: "error" }); props.onClose() },
    })
    list.push({ id: "cancel", label: "Cancel prompt", group: "Session", type: "action", enabled: hasSession && chat.streaming(), action: () => { chat.abort(); props.onClose() } })
    list.push({ id: "close-session", label: "Close session", group: "Session", type: "action", enabled: hasSession, action: async () => { if (props.sessionID) await sessions.remove(props.sessionID); props.onClose() } })
    list.push({ id: "cfg-mode", label: "Mode", group: "Configuration", type: "sub-picker", rightLabel: currentConfigValue("mode"), enabled: hasSession, action: () => openConfigPicker("mode", "Mode") })
    list.push({ id: "cfg-model", label: "Model", group: "Configuration", type: "sub-picker", rightLabel: currentConfigValue("model"), enabled: hasSession, action: () => openConfigPicker("model", "Model") })
    for (const cmd of serverCommands) {
      if (HIDDEN_COMMANDS.has(cmd.name) || DEDICATED_COMMANDS.has(cmd.name)) continue
      list.push({ id: `cmd-${cmd.name}`, label: `/${cmd.name}`, description: cmd.description, group: "Commands", type: "action", enabled: hasSession || cmd.category === "system", action: () => execCmd(cmd.name, cmd.usage) })
    }
    return list
  }, [hasSession, serverCommands, sessionConfig, currentConfigValue])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return items
    return items.filter((i) => i.label.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || i.group.toLowerCase().includes(q))
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

  function scrollHighlightedIntoView() {
    requestAnimationFrame(() => { rootRef.current?.querySelector("[data-highlighted]")?.scrollIntoView({ block: "nearest" }) })
  }

  function navigate(dir: 'up' | 'down' | 'enter') {
    const list = subPicker ? subPicker.choices : filtered
    const len = list.length
    if (dir === 'down') { setHighlighted((h) => (h + 1) % len); scrollHighlightedIntoView() }
    else if (dir === 'up') { setHighlighted((h) => (h - 1 + len) % len); scrollHighlightedIntoView() }
    else if (dir === 'enter') {
      if (subPicker) { const c = subPicker.choices[highlighted]; if (c) selectConfigValue(subPicker.configId, c.value) }
      else { const item = filtered[highlighted]; if (item && item.enabled !== false) item.action() }
    }
  }

  // Set ref synchronously during render so parent can forward keys immediately on mount
  if (props.navigateRef) {
    (props.navigateRef as React.MutableRefObject<typeof navigate>).current = navigate
  }
  useEffect(() => () => {
    if (props.navigateRef) (props.navigateRef as React.MutableRefObject<typeof navigate | null>).current = null
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); if (subPicker) { setSubPicker(null); return }; props.onClose(); return }
    if (e.key === "ArrowDown") { e.preventDefault(); navigate('down') }
    else if (e.key === "ArrowUp") { e.preventDefault(); navigate('up') }
    else if (e.key === "Enter") { e.preventDefault(); navigate('enter') }
  }

  return (
    <div ref={rootRef} className="w-full rounded-lg border border-border bg-bg-strong shadow-lg overflow-hidden" onKeyDown={handleKeyDown}>
      {subPicker ? (
        <>
          <div className="px-3 py-2 border-b border-border-weak/50 flex items-center gap-2">
            <Button variant="ghost" size="icon-xs" onClick={() => setSubPicker(null)}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M12.5 15.8337L6.66667 10.0003L12.5 4.16699" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </Button>
            <span className="text-sm font-medium leading-normal text-foreground">{subPicker.title}</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {subPicker.choices.map((choice, index) => (
              <button key={choice.value} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${highlighted === index ? "bg-accent" : ""}`}
                data-highlighted={highlighted === index ? "" : undefined}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => selectConfigValue(subPicker.configId, choice.value)}
              >
                <span className="w-4 shrink-0 text-center">{choice.current && <span className="text-primary" style={{ fontSize: "12px" }}>&#10003;</span>}</span>
                <span style={{ fontSize: "12px", fontWeight: "500" }} className={choice.current ? "text-foreground" : "text-fg-weak"}>{choice.label}</span>
                {choice.description && <span className="text-muted-foreground truncate flex-1 min-w-0" style={{ fontSize: "10.5px" }}>{choice.description}</span>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-border-weak/50">
            <Input ref={inputRef} type="text" placeholder="Filter actions..." className="bg-transparent text-sm leading-normal text-foreground placeholder:text-muted-foreground border-none shadow-none focus-visible:ring-0 h-auto px-0 py-0" value={query} onChange={(e) => { setQuery(e.target.value); setHighlighted(0) }} />
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-3 text-sm leading-normal text-muted-foreground text-center">No actions found</div>}
            {groups.map(([group, groupItems]) => (
              <div key={group}>
                <div className="px-3 py-1" style={{ fontSize: "11px", color: "var(--fg-weakest)" }}>{group}</div>
                {groupItems.map((item) => {
                  const globalIdx = filtered.indexOf(item)
                  const disabled = item.enabled === false
                  return (
                    <button key={item.id} className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${highlighted === globalIdx ? "bg-accent" : ""} ${disabled ? "opacity-40 pointer-events-none" : ""}`}
                      data-highlighted={highlighted === globalIdx ? "" : undefined}
                      onMouseEnter={() => !disabled && setHighlighted(globalIdx)}
                      onClick={() => !disabled && item.action()}
                      disabled={disabled}
                    >
                      <span className="text-sm font-medium leading-normal text-foreground flex-1 min-w-0">{item.label}</span>
                      {item.description && <span className="text-muted-foreground truncate" style={{ fontSize: "11px" }}>{item.description}</span>}
                      {item.rightLabel && <span className="text-muted-foreground" style={{ fontSize: "11px" }}>{item.rightLabel}</span>}
                      {item.type === "sub-picker" && <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className="text-foreground-weakerer"><path d="M7.5 4.16699L13.3333 10.0003L7.5 15.8337" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
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
