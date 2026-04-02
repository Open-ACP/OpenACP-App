import { createSignal, createResource, For, Show, createMemo, onMount, onCleanup } from "solid-js"
import { useChat } from "../context/chat"
import { useSessions } from "../context/sessions"
import { useWorkspace } from "../context/workspace"
import type { ServerCommand } from "../types"

// ── Platform-specific commands to hide ──────────────────────────────────────

const HIDDEN_COMMANDS = new Set([
  "tunnel", "tunnels", "usage", "summary", "archive", "clear",
  "tts", "text_to_speech", "enable_bypass", "disable_bypass",
  "resume", "integrate", "verbosity",
])

// Commands that have dedicated UI in the palette — don't show as raw commands
const DEDICATED_COMMANDS = new Set([
  "mode", "model", "thought", "bypass_permissions",
  "new", "cancel", "close", "fork", "sessions", "status",
])

// ── Types ───────────────────────────────────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────────────────

export function CommandPalette(props: {
  sessionID: string | undefined
  onClose: () => void
  onConfigChanged?: () => void
  initialFilter?: string
}) {
  const chat = useChat()
  const sessions = useSessions()
  const workspace = useWorkspace()

  const [query, setQuery] = createSignal(props.initialFilter ?? "")
  const [subPicker, setSubPicker] = createSignal<SubPickerState | null>(null)
  const [highlighted, setHighlighted] = createSignal(0)
  let inputRef: HTMLInputElement | undefined
  let rootRef: HTMLDivElement | undefined

  onMount(() => {
    inputRef?.focus()

    // Click outside → close
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef && !rootRef.contains(e.target as Node)) {
        props.onClose()
      }
    }
    // Delay to avoid catching the click that opened the palette
    setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 0)
    onCleanup(() => document.removeEventListener("mousedown", handleClickOutside))
  })

  // ── Fetch server commands ───────────────────────────────────────────────

  const [serverCommands] = createResource(async () => {
    try {
      return await workspace.client.getCommands()
    } catch {
      return [] as ServerCommand[]
    }
  })

  // ── Fetch config for toggles ────────────────────────────────────────────

  const [sessionConfig] = createResource(
    () => props.sessionID,
    async (sid) => {
      if (!sid) return null
      try {
        return await workspace.client.getSessionConfig(sid)
      } catch {
        return null
      }
    },
  )

  // ── Build items ─────────────────────────────────────────────────────────

  const hasSession = () => !!props.sessionID

  async function execCmd(name: string) {
    const sid = props.sessionID
    props.onClose()
    if (!sid) return
    // Add user message showing the command
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
  }

  async function openConfigPicker(category: string, title: string) {
    if (!props.sessionID) return
    try {
      const config = await workspace.client.getSessionConfig(props.sessionID)
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
  }

  async function selectConfigValue(configId: string, value: string) {
    if (!props.sessionID) return
    try {
      await workspace.client.setSessionConfig(props.sessionID, configId, value)
      props.onConfigChanged?.()
    } catch (e) {
      const { showToast } = await import("../../ui/src/components/toast")
      showToast({ description: "Failed to set config", variant: "error" })
    }
    setSubPicker(null)
    props.onClose()
  }

  async function toggleBypass() {
    if (!props.sessionID) return
    const current = sessionConfig()?.clientOverrides?.bypassPermissions ?? false
    try {
      await workspace.client.setClientOverrides(props.sessionID, { bypassPermissions: !current })
      props.onConfigChanged?.()
    } catch { /* ignore */ }
    props.onClose()
  }

  const currentConfigValue = (category: string): string | undefined => {
    const config = sessionConfig()
    if (!config) return undefined
    const opt = config.configOptions?.find(
      (o: any) => o.category === category || o.id === category,
    )
    if (!opt) return undefined
    if (opt.type === "select") {
      const choice = opt.options?.flat?.()
      // Find current label
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
  }

  const items = createMemo((): PaletteItem[] => {
    const list: PaletteItem[] = []

    // Context
    list.push({ id: "attach", label: "Attach file...", group: "Context", type: "action", action: () => props.onClose() })
    list.push({ id: "mention", label: "Mention file...", group: "Context", type: "action", action: () => props.onClose() })
    list.push({
      id: "clear",
      label: "Clear conversation",
      group: "Context",
      type: "action",
      enabled: hasSession(),
      action: () => { /* TODO: clear messages */ props.onClose() },
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
          const { showToast } = await import("../../ui/src/components/toast")
          showToast({ description: "Failed to create session", variant: "error" })
        }
        props.onClose()
      },
    })
    list.push({
      id: "cancel",
      label: "Cancel prompt",
      group: "Session",
      type: "action",
      enabled: hasSession() && chat.streaming(),
      action: () => { chat.abort(); props.onClose() },
    })
    list.push({
      id: "close-session",
      label: "Close session",
      group: "Session",
      type: "action",
      enabled: hasSession(),
      action: async () => {
        if (props.sessionID) await sessions.remove(props.sessionID)
        props.onClose()
      },
    })

    // Configuration
    list.push({
      id: "cfg-mode",
      label: "Mode",
      group: "Configuration",
      type: "sub-picker",
      rightLabel: currentConfigValue("mode"),
      enabled: hasSession(),
      action: () => openConfigPicker("mode", "Mode"),
    })
    list.push({
      id: "cfg-model",
      label: "Model",
      group: "Configuration",
      type: "sub-picker",
      rightLabel: currentConfigValue("model"),
      enabled: hasSession(),
      action: () => openConfigPicker("model", "Model"),
    })
    // Server commands (dynamic)
    for (const cmd of serverCommands() ?? []) {
      if (HIDDEN_COMMANDS.has(cmd.name)) continue
      if (DEDICATED_COMMANDS.has(cmd.name)) continue
      list.push({
        id: `cmd-${cmd.name}`,
        label: `/${cmd.name}`,
        description: cmd.description,
        group: "Commands",
        type: "action",
        enabled: hasSession() || cmd.category === "system",
        action: () => execCmd(cmd.name),
      })
    }

    return list
  })

  // ── Filtering ─────────────────────────────────────────────────────────

  const filtered = createMemo(() => {
    const q = query().toLowerCase().trim()
    const all = items()
    if (!q) return all
    return all.filter((i) =>
      i.label.toLowerCase().includes(q) ||
      i.description?.toLowerCase().includes(q) ||
      i.group.toLowerCase().includes(q)
    )
  })

  const groups = createMemo(() => {
    const map = new Map<string, PaletteItem[]>()
    for (const item of filtered()) {
      const list = map.get(item.group) ?? []
      list.push(item)
      map.set(item.group, list)
    }
    return Array.from(map.entries())
  })

  const flatFiltered = createMemo(() => filtered())

  // ── Keyboard navigation ───────────────────────────────────────────────

  function scrollHighlightedIntoView() {
    requestAnimationFrame(() => {
      rootRef?.querySelector("[data-highlighted]")?.scrollIntoView({ block: "nearest" })
    })
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault()
      if (subPicker()) {
        setSubPicker(null)
        return
      }
      props.onClose()
      return
    }

    const list = subPicker() ? subPicker()!.choices : flatFiltered()
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
      const idx = highlighted()
      if (subPicker()) {
        const choice = subPicker()!.choices[idx]
        if (choice) selectConfigValue(subPicker()!.configId, choice.value)
      } else {
        const item = flatFiltered()[idx]
        if (item && item.enabled !== false) item.action()
      }
    }
  }

  // ── Render: Sub-picker ────────────────────────────────────────────────

  function SubPickerView() {
    const sp = subPicker()!
    return (
      <>
        <div class="px-3 py-2 border-b border-border-weaker-base flex items-center gap-2">
          <button
            class="text-icon-weak hover:text-icon-base transition-colors"
            onClick={() => setSubPicker(null)}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M12.5 15.8337L6.66667 10.0003L12.5 4.16699" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span class="text-13-medium text-text-strong">{sp.title}</span>
        </div>
        <div class="max-h-64 overflow-y-auto py-1">
          <For each={sp.choices}>
            {(choice, index) => (
              <button
                class="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
                classList={{
                  "bg-surface-raised-base-hover": highlighted() === index(),
                }}
                data-highlighted={highlighted() === index() ? "" : undefined}
                onMouseEnter={() => setHighlighted(index())}
                onClick={() => selectConfigValue(sp.configId, choice.value)}
              >
                <span class="w-4 shrink-0 text-center">
                  <Show when={choice.current}>
                    <span class="text-text-interactive-base" style={{ "font-size": "12px" }}>&#10003;</span>
                  </Show>
                </span>
                <span style={{ "font-size": "12px", "font-weight": "500" }} classList={{ "text-text-strong": choice.current, "text-text-base": !choice.current }}>
                  {choice.label}
                </span>
                <Show when={choice.description}>
                  <span class="text-text-weak truncate flex-1 min-w-0" style={{ "font-size": "10.5px" }}>{choice.description}</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </>
    )
  }

  // ── Render: Main ──────────────────────────────────────────────────────

  return (
    <div
      ref={rootRef}
      class="w-full rounded-lg border border-border-base bg-surface-raised-stronger-non-alpha shadow-lg overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      <Show when={subPicker()} fallback={
        <>
          {/* Search */}
          <div class="px-3 py-2 border-b border-border-weaker-base">
            <input
              ref={inputRef}
              type="text"
              placeholder="Filter actions..."
              class="w-full bg-transparent text-13-regular text-text-strong placeholder:text-text-weak focus:outline-none"
              value={query()}
              onInput={(e) => { setQuery(e.currentTarget.value); setHighlighted(0) }}
            />
          </div>

          {/* Items */}
          <div class="max-h-72 overflow-y-auto py-1">
            <Show when={filtered().length === 0}>
              <div class="px-3 py-3 text-13-regular text-text-weak text-center">No actions found</div>
            </Show>

            <For each={groups()}>
              {([group, groupItems]) => (
                <div>
                  <div class="px-3 py-1" style={{ "font-size": "11px", color: "var(--text-weaker)" }}>
                    {group}
                  </div>
                  <For each={groupItems}>
                    {(item) => {
                      const globalIdx = () => flatFiltered().indexOf(item)
                      const disabled = () => item.enabled === false
                      return (
                        <button
                          class="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
                          classList={{
                            "bg-surface-raised-base-hover": highlighted() === globalIdx(),
                            "opacity-40 pointer-events-none": disabled(),
                          }}
                          data-highlighted={highlighted() === globalIdx() ? "" : undefined}
                          onMouseEnter={() => !disabled() && setHighlighted(globalIdx())}
                          onClick={() => !disabled() && item.action()}
                          disabled={disabled()}
                        >
                          <span class="text-13-medium text-text-strong flex-1 min-w-0">{item.label}</span>
                          <Show when={item.description}>
                            <span class="text-text-weak truncate" style={{ "font-size": "11px" }}>{item.description}</span>
                          </Show>
                          <Show when={item.rightLabel}>
                            <span class="text-text-weak" style={{ "font-size": "11px" }}>{item.rightLabel}</span>
                          </Show>
                          <Show when={item.type === "toggle"}>
                            <div
                              class="w-7 h-4 rounded-full relative transition-colors"
                              style={{ background: item.active ? "var(--surface-success-strong)" : "var(--surface-raised-base)" }}
                            >
                              <div
                                class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform"
                                style={{ transform: item.active ? "translateX(14px)" : "translateX(2px)" }}
                              />
                            </div>
                          </Show>
                          <Show when={item.type === "sub-picker"}>
                            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" class="text-icon-weaker">
                              <path d="M7.5 4.16699L13.3333 10.0003L7.5 15.8337" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                          </Show>
                        </button>
                      )
                    }}
                  </For>
                </div>
              )}
            </For>
          </div>
        </>
      }>
        <SubPickerView />
      </Show>
    </div>
  )
}
