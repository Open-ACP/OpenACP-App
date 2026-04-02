import { createSignal, onMount, onCleanup, Show } from "solid-js"
import { DockShellForm, DockTray } from "@openacp/ui/dock-surface"
import { IconButton } from "@openacp/ui/icon-button"
import { Button } from "@openacp/ui/button"
import { Tooltip } from "@openacp/ui/tooltip"
import { useChat } from "../context/chat"
import PhPlus from "phosphor-solid-js/dist/icons/Plus.esm"
import PhCommand from "phosphor-solid-js/dist/icons/Command.esm"
import { AgentSelector } from "./agent-selector"
import { CommandPalette } from "./command-palette"
import { ConfigSelector } from "./config-selector"

export function Composer() {
  const chat = useChat()
  const [text, setText] = createSignal("")
  const [agent, setAgent] = createSignal<string>()
  const [isBypass, setIsBypass] = createSignal(false)
  const [paletteOpen, setPaletteOpen] = createSignal(false)
  const [paletteFilter, setPaletteFilter] = createSignal<string | undefined>()
  const [configVersion, setConfigVersion] = createSignal(0)

  let editorRef: HTMLDivElement | undefined
  const space = "52px"

  // ── Cmd+/ global shortcut ─────────────────────────────────────────────

  function handleGlobalKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault()
      setPaletteFilter(undefined)
      setPaletteOpen((v) => !v)
    }
  }

  onMount(() => document.addEventListener("keydown", handleGlobalKeyDown))
  onCleanup(() => document.removeEventListener("keydown", handleGlobalKeyDown))

  // ── Input handlers ────────────────────────────────────────────────────

  const handleSubmit = async (e?: Event) => {
    e?.preventDefault()
    if (paletteOpen()) return
    const value = text().trim()
    if (!value) return
    setText("")
    if (editorRef) editorRef.textContent = ""
    await chat.sendPrompt(value)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && paletteOpen()) {
      setPaletteOpen(false)
      e.preventDefault()
      return
    }
    if (e.key === "Enter" && e.shiftKey) return
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (e.repeat) return
      void handleSubmit()
    }
  }

  const handleInput = () => {
    const value = editorRef?.textContent ?? ""
    setText(value)

    // Type "/" opens command palette with Commands filter
    if (value === "/") {
      setPaletteFilter("/")
      setPaletteOpen(true)
      return
    }

    // Continue filtering while palette is open and starts with /
    if (paletteOpen() && value.startsWith("/")) {
      setPaletteFilter(value)
      return
    }

    // Close palette if user deletes the /
    if (paletteOpen() && !value.startsWith("/")) {
      setPaletteOpen(false)
      setPaletteFilter(undefined)
    }
  }

  function closePalette() {
    setPaletteOpen(false)
    setPaletteFilter(undefined)
    // Clear "/" from input if that's all there is
    const value = text().trim()
    if (value.startsWith("/")) {
      setText("")
      if (editorRef) editorRef.textContent = ""
    }
    editorRef?.focus()
  }

  return (
    <div class="shrink-0 w-full pb-3 flex flex-col justify-center items-center bg-background-stronger">
      <div class="w-full px-3 md:max-w-200 md:mx-auto 2xl:max-w-[1000px] relative">
        {/* Command palette — above input */}
        <Show when={paletteOpen()}>
          <div class="absolute bottom-full left-3 right-3 mb-1 z-50">
            <CommandPalette
              sessionID={chat.activeSession()}
              onClose={closePalette}
              onConfigChanged={() => setConfigVersion((v) => v + 1)}
              initialFilter={paletteFilter()?.replace("/", "")}
            />
          </div>
        </Show>

        <DockShellForm
          onSubmit={handleSubmit}
          class="group/prompt-input focus-within:shadow-xs-border"
          style={isBypass() ? { "border-color": "var(--surface-critical-strong)", "border-width": "1.5px" } : undefined}
        >
          <div
            class="relative"
            onMouseDown={(e) => {
              const target = e.target
              if (!(target instanceof HTMLElement)) return
              if (target.closest("[data-action]")) return
              editorRef?.focus()
            }}
          >
            <div
              class="relative max-h-[240px] overflow-y-auto no-scrollbar"
              style={{ "scroll-padding-bottom": space }}
            >
              <div
                ref={editorRef}
                data-component="prompt-input"
                role="textbox"
                aria-multiline="true"
                contenteditable="true"
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                class="select-text w-full pl-3 pr-2 pt-2 text-14-regular text-text-strong focus:outline-none whitespace-pre-wrap"
                style={{ "padding-bottom": space }}
              />
              <Show when={!text().trim()}>
                <div
                  class="absolute top-0 inset-x-0 pl-3 pr-2 pt-2 text-14-regular text-text-weak pointer-events-none whitespace-nowrap truncate"
                  style={{ "padding-bottom": space }}
                >
                  Ask anything... "Explain how authentication works"
                </div>
              </Show>
            </div>

            <div
              aria-hidden="true"
              class="pointer-events-none absolute inset-x-0 bottom-0"
              style={{
                height: space,
                background: "linear-gradient(to top, var(--surface-raised-stronger-non-alpha) calc(100% - 20px), transparent)",
              }}
            />

            <div class="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2">
              <div class="flex items-center gap-1 pointer-events-auto">
                <Tooltip placement="top" value={chat.streaming() ? "Stop" : "Send"}>
                  <IconButton
                    data-action="prompt-submit"
                    type="submit"
                    disabled={!text().trim() && !chat.streaming()}
                    icon={chat.streaming() ? "stop" : "arrow-up"}
                    variant="primary"
                    class="size-8"
                    onClick={chat.streaming() ? (e: Event) => { e.preventDefault(); chat.abort() } : undefined}
                  />
                </Tooltip>
              </div>
            </div>

            <div class="pointer-events-none absolute bottom-2 left-2">
              <div class="pointer-events-auto flex items-center gap-0.5">
                <Button data-action="prompt-attach" type="button" variant="ghost" class="size-8 p-0">
                  <PhPlus size={18} weight="bold" class="text-icon-weak" />
                </Button>
                <Button
                  data-action="prompt-command"
                  type="button"
                  variant="ghost"
                  class="size-8 p-0"
                  onClick={(e: MouseEvent) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPaletteFilter(undefined)
                    setPaletteOpen(!paletteOpen())
                  }}
                >
                  <PhCommand size={18} weight="regular" class="text-icon-weak" />
                </Button>
              </div>
            </div>
          </div>
        </DockShellForm>

        <DockTray attach="top">
          <div class="px-1.75 pt-5.5 pb-2 flex items-center gap-1.5 min-w-0">
            <AgentSelector current={agent()} onSelect={setAgent} />
            <ConfigSelector category="model" sessionID={chat.activeSession()} refreshKey={configVersion()} />
            <div class="flex-1" />
            <ConfigSelector
              category="mode"
              sessionID={chat.activeSession()}
              refreshKey={configVersion()}
              onValueChange={(v) => {
                const val = v.toLowerCase()
                setIsBypass(val.includes("bypass") || val.includes("dangerous"))
              }}
            />
          </div>
        </DockTray>
      </div>
    </div>
  )
}
