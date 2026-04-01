import { createSignal, Show } from "solid-js"
import { DockShellForm, DockTray } from "@openacp/ui/dock-surface"
import { IconButton } from "@openacp/ui/icon-button"
import { Button } from "@openacp/ui/button"
import { Icon } from "@openacp/ui/icon"
import { Tooltip } from "@openacp/ui/tooltip"
import { useChat } from "../context/chat"
import { ModelSelector } from "./model-selector"
import { SlashCommandPopover } from "./slash-commands"
import { ConfigSelector } from "./config-selector"

export function Composer() {
  const chat = useChat()
  const [text, setText] = createSignal("")
  const [model, setModel] = createSignal<string>()
  const [slashQuery, setSlashQuery] = createSignal<string | null>(null)

  let editorRef: HTMLDivElement | undefined
  const space = "44px"

  const handleSubmit = async (e?: Event) => {
    e?.preventDefault()
    if (slashQuery() !== null) return // Don't submit while slash popover open
    const value = text().trim()
    if (!value) return
    setText("")
    if (editorRef) editorRef.textContent = ""
    await chat.sendPrompt(value)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && slashQuery() !== null) {
      setSlashQuery(null)
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

    // Detect slash command
    if (value.startsWith("/") && !value.includes(" ")) {
      setSlashQuery(value)
    } else {
      setSlashQuery(null)
    }
  }

  const handleSlashSelect = (replacement: string) => {
    if (editorRef) editorRef.textContent = replacement
    setText(replacement)
    setSlashQuery(null)
    editorRef?.focus()
  }

  return (
    <div class="shrink-0 w-full pb-3 flex flex-col justify-center items-center bg-background-stronger">
      <div class="w-full px-3 md:max-w-200 md:mx-auto 2xl:max-w-[1000px] relative">
        {/* Slash command popover — above input */}
        <Show when={slashQuery() !== null}>
          <div class="absolute bottom-full left-3 right-3 mb-1 z-50">
            <SlashCommandPopover
              query={slashQuery()!}
              sessionID={chat.activeSession()}
              onSelect={handleSlashSelect}
              onClose={() => {
                setSlashQuery(null)
                if (editorRef) editorRef.textContent = ""
                setText("")
              }}
            />
          </div>
        </Show>

        <DockShellForm
          onSubmit={handleSubmit}
          class="group/prompt-input focus-within:shadow-xs-border"
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
              <div class="pointer-events-auto">
                <Button data-action="prompt-attach" type="button" variant="ghost" class="size-8 p-0">
                  <Icon name="plus" class="size-4.5" />
                </Button>
              </div>
            </div>
          </div>
        </DockShellForm>

        <DockTray attach="top">
          <div class="px-1.75 pt-5.5 pb-2 flex items-center gap-1.5 min-w-0">
            <ModelSelector current={model()} onSelect={setModel} />
            <ConfigSelector category="mode" sessionID={chat.activeSession()} />
            <ConfigSelector category="model" sessionID={chat.activeSession()} />
          </div>
        </DockTray>
      </div>
    </div>
  )
}
