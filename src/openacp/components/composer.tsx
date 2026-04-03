import React, { useState, useEffect, useRef, useCallback } from "react"
import { Plus, Command } from "@phosphor-icons/react"
import { DockShellForm, DockTray } from "./ui/dock-surface"
import { useChat } from "../context/chat"
import { AgentSelector } from "./agent-selector"
import { CommandPalette } from "./command-palette"
import { ConfigSelector } from "./config-selector"

export function Composer() {
  const chat = useChat()
  const [text, setText] = useState("")
  const [agent, setAgent] = useState<string>()
  const [isBypass, setIsBypass] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteFilter, setPaletteFilter] = useState<string | undefined>()
  const [configVersion, setConfigVersion] = useState(0)

  const editorRef = useRef<HTMLDivElement>(null)
  const space = "52px"

  // Cmd+/ global shortcut
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        setPaletteFilter(undefined)
        setPaletteOpen((v) => !v)
      }
    }
    document.addEventListener("keydown", handleGlobalKeyDown)
    return () => document.removeEventListener("keydown", handleGlobalKeyDown)
  }, [])

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (paletteOpen) return
    const value = text.trim()
    if (!value) return
    setText("")
    if (editorRef.current) editorRef.current.textContent = ""
    await chat.sendPrompt(value)
  }, [text, paletteOpen, chat])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape" && paletteOpen) {
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
  }, [paletteOpen, handleSubmit])

  const handleInput = useCallback(() => {
    const value = editorRef.current?.textContent ?? ""
    setText(value)

    if (value === "/") {
      setPaletteFilter("/")
      setPaletteOpen(true)
      return
    }
    if (paletteOpen && value.startsWith("/")) {
      setPaletteFilter(value)
      return
    }
    if (paletteOpen && !value.startsWith("/")) {
      setPaletteOpen(false)
      setPaletteFilter(undefined)
    }
  }, [paletteOpen])

  function closePalette() {
    setPaletteOpen(false)
    setPaletteFilter(undefined)
    const value = text.trim()
    if (value.startsWith("/")) {
      setText("")
      if (editorRef.current) editorRef.current.textContent = ""
    }
    editorRef.current?.focus()
  }

  return (
    <div className="shrink-0 w-full pb-3 flex flex-col justify-center items-center bg-background-stronger">
      <div className="w-full px-3 md:max-w-200 md:mx-auto 2xl:max-w-[1000px] relative">
        {paletteOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-1 z-50">
            <CommandPalette
              sessionID={chat.activeSession()}
              onClose={closePalette}
              onConfigChanged={() => setConfigVersion((v) => v + 1)}
              initialFilter={paletteFilter?.replace("/", "")}
            />
          </div>
        )}

        <DockShellForm
          onSubmit={handleSubmit}
          className="group/prompt-input focus-within:shadow-xs-border"
          style={isBypass ? { borderColor: "var(--surface-critical-strong)", borderWidth: "1.5px" } : undefined}
        >
          <div
            className="relative"
            onMouseDown={(e) => {
              const target = e.target
              if (!(target instanceof HTMLElement)) return
              if (target.closest("[data-action]")) return
              editorRef.current?.focus()
            }}
          >
            <div className="relative max-h-[240px] overflow-y-auto no-scrollbar" style={{ scrollPaddingBottom: space }}>
              <div
                ref={editorRef}
                data-component="prompt-input"
                role="textbox"
                aria-multiline="true"
                contentEditable="true"
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                className="select-text w-full pl-3 pr-2 pt-2 text-14-regular text-text-strong focus:outline-none whitespace-pre-wrap"
                style={{ paddingBottom: space }}
              />
              {!text.trim() && (
                <div
                  className="absolute top-0 inset-x-0 pl-3 pr-2 pt-2 text-14-regular text-text-weak pointer-events-none whitespace-nowrap truncate"
                  style={{ paddingBottom: space }}
                >
                  Ask anything... "Explain how authentication works"
                </div>
              )}
            </div>

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0"
              style={{
                height: space,
                background: "linear-gradient(to top, var(--surface-raised-stronger-non-alpha) calc(100% - 20px), transparent)",
              }}
            />

            <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-2">
              <div className="flex items-center gap-1 pointer-events-auto">
                <button
                  data-action="prompt-submit"
                  type="submit"
                  disabled={!text.trim() && !chat.streaming()}
                  className="size-8 flex items-center justify-center rounded-md bg-text-strong text-background-stronger disabled:opacity-40"
                  onClick={chat.streaming() ? (e: React.MouseEvent) => { e.preventDefault(); chat.abort() } : undefined}
                >
                  {chat.streaming() ? (
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><rect x="5" y="5" width="10" height="10" fill="currentColor" rx="1" /></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M10 15.8337V4.16699M4.16699 10.0003L10 4.16699L15.8337 10.0003" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              </div>
            </div>

            <div className="pointer-events-none absolute bottom-2 left-2">
              <div className="pointer-events-auto flex items-center gap-0.5">
                <button data-action="prompt-attach" type="button" className="size-8 p-0 flex items-center justify-center rounded-md hover:bg-surface-raised-base-hover transition-colors">
                  <Plus size={18} weight="bold" className="text-icon-weak" />
                </button>
                <button
                  data-action="prompt-command"
                  type="button"
                  className="size-8 p-0 flex items-center justify-center rounded-md hover:bg-surface-raised-base-hover transition-colors"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPaletteFilter(undefined)
                    setPaletteOpen(!paletteOpen)
                  }}
                >
                  <Command size={18} weight="regular" className="text-icon-weak" />
                </button>
              </div>
            </div>
          </div>
        </DockShellForm>

        <DockTray attach="top">
          <div className="px-1.75 pt-5.5 pb-2 flex items-center gap-1.5 min-w-0">
            <AgentSelector current={agent} onSelect={setAgent} />
            <ConfigSelector category="model" sessionID={chat.activeSession()} refreshKey={configVersion} />
            <div className="flex-1" />
            <ConfigSelector
              category="mode"
              sessionID={chat.activeSession()}
              refreshKey={configVersion}
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
