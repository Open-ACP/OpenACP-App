import React, { useState, useEffect, useCallback } from "react"
import { Plus } from "@phosphor-icons/react"
import { useWorkspace } from "../context/workspace"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

export function AgentSelector(props: {
  current?: string
  sessionID?: string
  onSelect: (agent: string) => void
  onSwitched?: () => void
  onInstallAgent?: () => void
}) {
  const workspace = useWorkspace()
  const [agents, setAgents] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [switching, setSwitching] = useState(false)

  const fetchAgents = useCallback(() => {
    workspace.client.agents().then((r: any) => setAgents(r.agents || [])).catch(() => setAgents([]))
  }, [workspace.client])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  // Re-fetch when popover opens
  useEffect(() => { if (open) fetchAgents() }, [open])

  // Auto-select first agent
  useEffect(() => {
    if (agents.length > 0 && !props.current) {
      props.onSelect(agents[0].name)
    }
  }, [agents, props.current])

  async function handleSelect(agentName: string) {
    if (agentName === props.current) return

    const shouldSwitch = props.sessionID && props.current && agentName !== props.current
    props.onSelect(agentName)

    if (shouldSwitch) {
      setSwitching(true)
      try {
        await workspace.client.switchAgent(props.sessionID, agentName)
        props.onSwitched?.()
      } catch (e) {
        console.error("Failed to switch agent", e)
      } finally {
        setSwitching(false)
      }
    }
  }

  const currentName = (() => {
    if (switching) return "Switching..."
    if (!props.current) return "Select Agent"
    const agent = agents.find((a) => a.name === props.current)
    return agent?.displayName || agent?.name || props.current
  })()

  const filtered = search
    ? agents.filter((a) => (a.displayName || a.name).toLowerCase().includes(search.toLowerCase()))
    : agents

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) fetchAgents(); if (!open) setSearch("") }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 max-w-[320px] text-sm font-normal capitalize gap-1 px-2"
          disabled={switching}
        >
          <span className="truncate">{currentName}</span>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className="shrink-0"><path d="M5.83 8.33L10 12.5l4.17-4.17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={4} className="w-72 max-h-80 flex flex-col p-2 overflow-hidden">
        <Input
          type="text"
          placeholder="Search agents..."
          className="h-7 text-sm font-normal border-none shadow-none bg-transparent focus-visible:ring-0 focus-visible:border-0 mb-1 px-2"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="text-sm font-normal text-muted-foreground px-2 py-2">No agents available</div>
          )}
          {filtered.map((agent: any) => (
            <DropdownMenuItem
              key={agent.name}
              className={`text-sm font-normal capitalize ${agent.name === props.current ? "text-foreground" : "text-foreground-weak"}`}
              onClick={() => handleSelect(agent.name)}
            >
              <span className="truncate">{agent.displayName || agent.name}</span>
              {agent.name === props.current && (
                <span className="ml-auto text-primary text-2xs font-normal shrink-0">&#10003;</span>
              )}
            </DropdownMenuItem>
          ))}
        </div>
        {props.onInstallAgent && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-sm font-normal text-muted-foreground"
              onClick={() => props.onInstallAgent?.()}
            >
              <Plus size={14} weight="bold" />
              <span>Install agent...</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
