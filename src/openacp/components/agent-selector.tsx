import React, { useState, useEffect } from "react"
import { useWorkspace } from "../context/workspace"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

export function AgentSelector(props: {
  current?: string
  onSelect: (agent: string) => void
}) {
  const workspace = useWorkspace()
  const [agents, setAgents] = useState<any[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    workspace.client.agents().then((r: any) => setAgents(r.agents || [])).catch(() => setAgents([]))
  }, [workspace.client])

  // Auto-select first agent
  useEffect(() => {
    if (agents.length > 0 && !props.current) {
      props.onSelect(agents[0].name)
    }
  }, [agents, props.current])

  const currentName = (() => {
    if (!props.current) return "Select Agent"
    const agent = agents.find((a) => a.name === props.current)
    return agent?.displayName || agent?.name || props.current
  })()

  const filtered = search
    ? agents.filter((a) => (a.displayName || a.name).toLowerCase().includes(search.toLowerCase()))
    : agents

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setSearch("") }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 max-w-[320px] text-12-regular text-text-base capitalize gap-1 px-2"
        >
          <span className="truncate">{currentName}</span>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className="shrink-0"><path d="M5.83 8.33L10 12.5l4.17-4.17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-72 max-h-80 flex flex-col p-2 overflow-hidden">
        <Input
          type="text"
          placeholder="Search agents..."
          className="h-7 text-12-regular border-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:border-0 mb-1 px-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="text-12-regular text-text-weak px-2 py-2">No agents available</div>
          )}
          {filtered.map((agent: any) => (
            <DropdownMenuItem
              key={agent.name}
              className={`text-12-regular capitalize ${agent.name === props.current ? "text-text-strong" : "text-text-base"}`}
              onClick={() => props.onSelect(agent.name)}
            >
              <span className="truncate">{agent.displayName || agent.name}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
