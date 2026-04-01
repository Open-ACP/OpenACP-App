import { For, Show, createMemo, createSignal } from "solid-js"
import { Icon } from "@openacp/ui/icon"
import { IconButton } from "@openacp/ui/icon-button"
import { Spinner } from "@openacp/ui/spinner"
import { Tooltip } from "@openacp/ui/tooltip"
import { DropdownMenu } from "@openacp/ui/dropdown-menu"
import { ResizeHandle } from "@openacp/ui/resize-handle"
import { useSessions } from "../context/sessions"
import { useChat } from "../context/chat"
import { useWorkspace } from "../context/workspace"

const DEFAULT_SIDEBAR_WIDTH = 280
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 480

export function SidebarPanel() {
  const sessions = useSessions()
  const chat = useChat()
  const workspace = useWorkspace()

  const [panelWidth, setPanelWidth] = createSignal(DEFAULT_SIDEBAR_WIDTH)

  const workspaceName = createMemo(() => workspace.directory.split("/").pop() || "Workspace")
  const workspacePath = createMemo(() => {
    const parts = workspace.directory.split("/")
    if (parts.length > 3) return "~/" + parts.slice(3).join("/")
    return workspace.directory
  })

  return (
    <div
      class="relative flex flex-col min-h-0 min-w-0 box-border rounded-tl-[12px] px-3 border-l border-t border-border-weaker-base bg-background-base overflow-hidden shrink-0"
      style={{ width: `${panelWidth()}px` }}
    >
      <ResizeHandle
        direction="horizontal"
        edge="end"
        size={panelWidth()}
        min={MIN_SIDEBAR_WIDTH}
        max={MAX_SIDEBAR_WIDTH}
        onResize={setPanelWidth}
      />
      {/* Project header — matches layout.tsx SidebarPanel lines 2109-2155 */}
      <div class="shrink-0 pl-1 py-1">
        <div class="group/project flex items-start justify-between gap-2 py-2 pl-2 pr-0">
          <div class="flex flex-col min-w-0">
            <span class="text-14-medium text-text-strong truncate">{workspaceName()}</span>
            <Tooltip placement="bottom" gutter={2} value={workspace.directory} class="shrink-0">
              <span class="text-12-regular text-text-base truncate">{workspacePath()}</span>
            </Tooltip>
          </div>
          <DropdownMenu>
            <DropdownMenu.Trigger
              as={IconButton}
              icon="dot-grid"
              variant="ghost"
              class="shrink-0 size-6 rounded-md transition-opacity opacity-0 group-hover/project:opacity-100 group-focus-within/project:opacity-100 data-[expanded]:opacity-100 data-[expanded]:bg-surface-base-active"
            />
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="mt-1">
                <DropdownMenu.Item onSelect={() => {}}>
                  <DropdownMenu.ItemLabel>Close project</DropdownMenu.ItemLabel>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </div>
      </div>

      {/* Session list */}
      <div class="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        <nav class="flex flex-col gap-1">
          {/* New session */}
          <div class="group/session relative w-full min-w-0 rounded-md cursor-default transition-colors pl-2 pr-3 hover:bg-surface-raised-base-hover [&:has(:focus-visible)]:bg-surface-raised-base-hover has-[.active]:bg-surface-base-active">
            <button
              class="flex items-center gap-1 min-w-0 w-full text-left focus:outline-none py-1"
              classList={{ active: !chat.activeSession() }}
              onClick={() => chat.setActiveSession("")}
            >
              <div class="shrink-0 size-6 flex items-center justify-center">
                <Icon name="new-session" size="small" class="text-icon-weak" />
              </div>
              <span class="text-14-regular text-text-strong min-w-0 flex-1 truncate">New session</span>
            </button>
          </div>

          <div class="h-2" />

          <Show when={sessions.loading()}>
            <SessionSkeleton />
          </Show>

          <For each={sessions.list()}>
            {(session) => (
              <SessionItem
                session={session}
                active={chat.activeSession() === session.id}
                streaming={chat.streaming() && chat.activeSession() === session.id}
                onClick={() => chat.setActiveSession(session.id)}
                onDelete={() => sessions.remove(session.id)}
              />
            )}
          </For>
        </nav>
      </div>
    </div>
  )
}

/** Matches SessionItem + SessionRow from sidebar-items.tsx */
function SessionItem(props: {
  session: { id: string; name: string; agent: string; status: string }
  active: boolean
  streaming: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div
      data-session-id={props.session.id}
      class="group/session relative w-full min-w-0 rounded-md cursor-default pl-2 pr-3 transition-colors
             hover:bg-surface-raised-base-hover [&:has(:focus-visible)]:bg-surface-raised-base-hover has-[.active]:bg-surface-base-active"
    >
      <div class="flex min-w-0 items-center gap-1">
        <div class="min-w-0 flex-1">
          <button
            class="flex items-center gap-1 min-w-0 w-full text-left focus:outline-none py-1"
            classList={{ active: props.active }}
            onClick={props.onClick}
          >
            <div class="shrink-0 size-6 flex items-center justify-center">
              <Show when={props.streaming} fallback={
                <Icon name="dash" size="small" class="text-icon-weak" />
              }>
                <Spinner class="size-[15px]" />
              </Show>
            </div>
            <span class="text-14-regular text-text-strong min-w-0 flex-1 truncate">{props.session.name}</span>
          </button>
        </div>
        <div class="shrink-0 overflow-hidden transition-[width,opacity] w-0 opacity-0 pointer-events-none group-hover/session:w-6 group-hover/session:opacity-100 group-hover/session:pointer-events-auto group-focus-within/session:w-6 group-focus-within/session:opacity-100 group-focus-within/session:pointer-events-auto">
          <Tooltip value="Archive" placement="top">
            <IconButton
              icon="archive"
              variant="ghost"
              class="size-6 rounded-md"
              onClick={(e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); props.onDelete() }}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function SessionSkeleton() {
  return (
    <div class="flex flex-col gap-1">
      <For each={[1, 2, 3, 4]}>
        {() => <div class="h-8 w-full rounded-md bg-surface-raised-base opacity-60 animate-pulse" />}
      </For>
    </div>
  )
}
