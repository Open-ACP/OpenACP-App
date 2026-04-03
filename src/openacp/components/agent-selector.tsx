import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { CaretDown } from "@phosphor-icons/react"
import { useWorkspace } from "../context/workspace"

interface Agent {
  name: string
  displayName?: string
}

export function AgentSelector({
  current,
  onSelect,
}: {
  current?: string
  onSelect: (agent: string) => void
}) {
  const workspace = useWorkspace()
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [search, setSearch] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Fetch agents
  useEffect(() => {
    let cancelled = false
    workspace.client.agents().then((result) => {
      if (!cancelled) setAgents(result.agents)
    }).catch(() => {
      if (!cancelled) setAgents([])
    })
    return () => { cancelled = true }
  }, [workspace.client])

  // Auto-select first agent if none selected
  useEffect(() => {
    if (agents.length > 0 && !current) {
      onSelect(agents[0].name)
    }
  }, [agents, current, onSelect])

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

  // Focus search on open
  useEffect(() => {
    if (open) {
      setSearch("")
      setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open])

  const currentName = current
    ? (agents.find((a) => a.name === current)?.displayName || agents.find((a) => a.name === current)?.name || current)
    : "Select Agent"

  const filtered = agents.filter((a) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (a.displayName || a.name).toLowerCase().includes(q)
  })

  return (
    <div ref={rootRef} className="relative">
      <button
        className="min-w-0 max-w-[320px] text-13-regular text-text-base capitalize flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-raised-base-hover transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{currentName}</span>
        <CaretDown size={12} className="shrink-0" />
      </button>

      {open && createPortal(
        <div
          className="fixed w-72 max-h-80 flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 overflow-hidden"
          style={(() => {
            const rect = rootRef.current?.getBoundingClientRect()
            if (!rect) return {}
            return { bottom: window.innerHeight - rect.top + 4, left: rect.left }
          })()}
        >
          <input
            ref={searchRef}
            type="text"
            placeholder="Search agents..."
            className="w-full px-2 py-1.5 mb-1 text-13-regular bg-transparent border border-border-weaker-base rounded focus:outline-none text-text-strong placeholder:text-text-weak"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex-1 min-h-0 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-13-regular text-text-weak text-center">No agents available</div>
            ) : (
              filtered.map((agent) => (
                <button
                  key={agent.name}
                  className={`w-full flex items-center gap-x-2 px-2 py-1.5 rounded text-left text-13-regular hover:bg-surface-raised-base-hover transition-colors ${
                    agent.name === current ? "text-text-strong" : "text-text-base"
                  }`}
                  onClick={() => {
                    onSelect(agent.name)
                    setOpen(false)
                  }}
                >
                  <span className="truncate capitalize">{agent.displayName || agent.name}</span>
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
