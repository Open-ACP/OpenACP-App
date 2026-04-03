import React, { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { useWorkspace } from "../context/workspace"

export function AgentSelector(props: {
  current?: string
  onSelect: (agent: string) => void
}) {
  const workspace = useWorkspace()
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    workspace.client.agents().then((r: any) => setAgents(r.agents || [])).catch(() => setAgents([]))
  }, [workspace.client])

  // Auto-select first agent
  useEffect(() => {
    if (agents.length > 0 && !props.current) {
      props.onSelect(agents[0].name)
    }
  }, [agents, props.current])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (popupRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open])

  const currentName = (() => {
    if (!props.current) return "Select Agent"
    const agent = agents.find((a) => a.name === props.current)
    return agent?.displayName || agent?.name || props.current
  })()

  const filtered = search
    ? agents.filter((a) => (a.displayName || a.name).toLowerCase().includes(search.toLowerCase()))
    : agents

  return (
    <div ref={rootRef} className="relative">
      <button
        className="min-w-0 max-w-[320px] text-13-regular text-text-base capitalize flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-raised-base-hover"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{currentName}</span>
        <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className="shrink-0"><path d="M5.83 8.33L10 12.5l4.17-4.17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && createPortal(
        <div
          ref={popupRef}
          className="fixed w-72 max-h-80 flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 overflow-hidden"
          style={(() => {
            const rect = rootRef.current?.getBoundingClientRect()
            if (!rect) return {}
            return { bottom: window.innerHeight - rect.top + 4, left: rect.left }
          })()}
        >
          <input
            type="text"
            placeholder="Search agents..."
            className="w-full bg-transparent text-13-regular text-text-strong placeholder:text-text-weak focus:outline-none mb-1 px-2 py-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && <div className="text-13-regular text-text-weak px-2 py-2">No agents available</div>}
            {filtered.map((agent: any) => (
              <button
                key={agent.name}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-13-regular hover:bg-surface-raised-base-hover ${
                  agent.name === props.current ? "text-text-strong" : "text-text-base"
                }`}
                onClick={() => { props.onSelect(agent.name); setOpen(false) }}
              >
                <span className="truncate capitalize">{agent.displayName || agent.name}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
