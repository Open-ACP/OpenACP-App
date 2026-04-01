import { createResource, createSignal, For, Show } from "solid-js"
import { Popover } from "@kobalte/core/popover"
import { Button } from "@openacp/ui/button"
import { Icon } from "@openacp/ui/icon"
import { useWorkspace } from "../context/workspace"

interface ConfigChoice {
  value: string
  label: string
  description?: string
}

export function ConfigSelector(props: {
  category: "mode" | "model"
  sessionID: string | undefined
}) {
  const workspace = useWorkspace()
  const [open, setOpen] = createSignal(false)

  const [config, { refetch }] = createResource(
    () => props.sessionID,
    async (sid) => {
      if (!sid) return null
      try {
        const res = await workspace.client.getSessionConfig(sid)
        const opt = res.configOptions?.find(
          (o: any) => o.category === props.category || o.id === props.category
        )
        if (!opt || opt.type !== "select") return null

        // Flatten grouped options — API uses `name` not `label`
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
        return { id: opt.id, name: opt.name, currentValue: opt.currentValue as string, choices }
      } catch {
        return null
      }
    },
  )

  const currentLabel = () => {
    const c = config()
    if (!c) return props.category
    const choice = c.choices.find((ch) => ch.value === c.currentValue)
    return choice?.label || c.currentValue
  }

  async function select(value: string) {
    const c = config()
    if (!c || !props.sessionID) return
    try {
      await workspace.client.setSessionConfig(props.sessionID, c.id, value)
      const updated = await refetch()
      console.log(`[config] ${props.category} set to ${value}`, updated)
    } catch (e) {
      console.error(`Failed to set ${props.category}`, e)
    }
    setOpen(false)
  }

  return (
    <Show when={props.sessionID}>
      <Popover open={open()} onOpenChange={(v) => { setOpen(v); if (v) void refetch() }} placement="top-start" gutter={4}>
        <Popover.Trigger
          as={Button}
          variant="ghost"
          size="normal"
          class="min-w-0 max-w-[160px] text-13-regular text-text-base capitalize"
        >
          <span class="truncate">{currentLabel()}</span>
          <Icon name="chevron-down" size="small" class="shrink-0" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            class="w-72 max-h-64 flex flex-col p-1 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 outline-none overflow-y-auto"
            onPointerDownOutside={() => setOpen(false)}
          >
            <Popover.Title class="px-3 py-1 text-12-medium text-text-weak capitalize">
              {config()?.name || props.category}
            </Popover.Title>
            <For each={config()?.choices || []}>
              {(choice) => {
                const isCurrent = () => choice.value === config()?.currentValue
                return (
                  <button
                    class="w-full flex items-center gap-2 px-3 py-1.5 rounded text-left text-13-regular hover:bg-surface-raised-base-hover"
                    classList={{
                      "text-text-strong": isCurrent(),
                      "text-text-base": !isCurrent(),
                    }}
                    onClick={() => select(choice.value)}
                  >
                    <span class="w-4 shrink-0 text-center">
                      <Show when={isCurrent()}>
                        <span class="text-text-interactive-base">✓</span>
                      </Show>
                    </span>
                    <span class="text-13-medium">{choice.label}</span>
                    <Show when={choice.description}>
                      <span class="text-text-weak text-12-regular truncate flex-1 min-w-0">— {choice.description}</span>
                    </Show>
                  </button>
                )
              }}
            </For>
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </Show>
  )
}
