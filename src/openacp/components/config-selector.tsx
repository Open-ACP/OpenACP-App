import React, { useState, useEffect, useCallback } from "react"
import { useWorkspace } from "../context/workspace"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { Button } from "./ui/button"

interface ConfigChoice {
  value: string
  label: string
  description?: string
}

interface ConfigData {
  id: string
  name: string
  currentValue: string
  choices: ConfigChoice[]
}

export function ConfigSelector(props: {
  category: "mode" | "model"
  sessionID: string | undefined
  onValueChange?: (value: string) => void
  refreshKey?: number
}) {
  const workspace = useWorkspace()
  const [config, setConfig] = useState<ConfigData | null>(null)

  const fetchConfig = useCallback(async () => {
    if (!props.sessionID) { setConfig(null); return }
    try {
      const res = await workspace.client.getSessionConfig(props.sessionID)
      const opt = res.configOptions?.find(
        (o: any) => o.category === props.category || o.id === props.category
      )
      if (!opt || opt.type !== "select") { setConfig(null); return }
      const choices: ConfigChoice[] = []
      for (const item of opt.options || []) {
        if ("options" in item && Array.isArray(item.options)) {
          for (const sub of item.options) {
            choices.push({ value: sub.value, label: sub.label || sub.name || sub.value, description: sub.description })
          }
        } else {
          choices.push({ value: item.value, label: item.label || item.name || item.value, description: item.description })
        }
      }
      setConfig({ id: opt.id, name: opt.name, currentValue: opt.currentValue as string, choices })
    } catch {
      setConfig(null)
    }
  }, [props.sessionID, props.category, workspace.client])

  useEffect(() => { void fetchConfig() }, [fetchConfig, props.refreshKey])

  const currentLabel = (() => {
    if (!config) return props.category
    const choice = config.choices.find((ch) => ch.value === config.currentValue)
    return choice?.label || config.currentValue
  })()

  async function select(value: string) {
    if (!config || !props.sessionID) return
    try {
      await workspace.client.setSessionConfig(props.sessionID, config.id, value)
      await fetchConfig()
      props.onValueChange?.(value)
    } catch (e) {
      console.error(`Failed to set ${props.category}`, e)
    }
  }

  if (!props.sessionID) return null

  const align = props.category === "mode" ? "end" : "start"

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void fetchConfig() }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 max-w-[160px] text-sm font-normal capitalize gap-1 px-2"
        >
          <span className="truncate">{currentLabel}</span>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" className="shrink-0"><path d="M5.83 8.33L10 12.5l4.17-4.17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side="top" sideOffset={4} className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-foreground-weaker uppercase tracking-wider">
          {props.category === "mode" ? "Modes" : (config?.name || props.category)}
        </DropdownMenuLabel>
        {(config?.choices || []).map((choice) => {
          const isCurrent = choice.value === config?.currentValue
          return (
            <DropdownMenuItem
              key={choice.value}
              className="items-start gap-2 px-3 py-1.5"
              onClick={() => void select(choice.value)}
            >
              <span className="w-4 shrink-0 text-center mt-px">
                {isCurrent && <span className="text-primary">&#10003;</span>}
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className={`text-sm font-medium ${isCurrent ? "" : "text-foreground-weak"}`}>
                  {choice.label}
                </span>
                {choice.description && (
                  <span className="text-xs font-normal text-muted-foreground truncate">{choice.description}</span>
                )}
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
