import { createResource, createSignal, createEffect } from "solid-js"
import { Popover } from "@kobalte/core/popover"
import { Button } from "@openacp/ui/button"
import { Icon } from "@openacp/ui/icon"
import { List } from "@openacp/ui/list"
import { useWorkspace } from "../context/workspace"

export function AgentSelector(props: {
  current?: string
  onSelect: (agent: string) => void
}) {
  const workspace = useWorkspace()
  const [open, setOpen] = createSignal(false)

  const [agents] = createResource(async () => {
    try {
      const result = await workspace.client.agents()
      return result.agents
    } catch {
      return []
    }
  })

  // Auto-select first agent if none selected
  createEffect(() => {
    const list = agents()
    if (list && list.length > 0 && !props.current) {
      props.onSelect(list[0].name)
    }
  })

  const currentName = () => {
    const name = props.current
    if (!name) return "Select Agent"
    const agent = agents()?.find((a) => a.name === name)
    return agent?.displayName || agent?.name || name
  }

  return (
    <Popover
      open={open()}
      onOpenChange={setOpen}
      placement="top-start"
      gutter={4}
    >
      <Popover.Trigger
        as={Button}
        variant="ghost"
        size="normal"
        class="min-w-0 max-w-[320px] text-13-regular text-text-base capitalize"
      >
        <span class="truncate">{currentName()}</span>
        <Icon name="chevron-down" size="small" class="shrink-0" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          class="w-72 h-80 flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 outline-none overflow-hidden"
          onEscapeKeyDown={(e: Event) => { e.preventDefault(); setOpen(false) }}
          onPointerDownOutside={() => setOpen(false)}
          onFocusOutside={() => setOpen(false)}
        >
          <Popover.Title class="sr-only">Select agent</Popover.Title>
          <List
            class="flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0 p-1"
            search={{ placeholder: "Search agents...", autofocus: true }}
            emptyMessage="No agents available"
            key={(x: any) => x.name}
            items={() => agents() || []}
            current={props.current}
            filterKeys={["name", "displayName"]}
            onSelect={(x: any) => {
              if (x) props.onSelect(x.name)
              setOpen(false)
            }}
          >
            {(i: any) => (
              <div class="w-full flex items-center gap-x-2 text-13-regular">
                <span class="truncate capitalize">{i.displayName || i.name}</span>
              </div>
            )}
          </List>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}
