import { Sidebar, TextAlignLeft, FolderOpen, Globe, Terminal, Bell } from "@phosphor-icons/react"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { NotificationPopover } from "./notification-popover"
import { cn } from "src/lib/utils"

interface TitlebarProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  reviewOpen: boolean
  onToggleReview: () => void
  fileTreeOpen: boolean
  onToggleFileTree: () => void
  browserOpen: boolean
  onToggleBrowser: () => void
  terminalOpen: boolean
  onToggleTerminal: () => void
  hideFileTree?: boolean
  hideBrowser?: boolean
  hideTerminal?: boolean
  disabled?: boolean
  notificationCount?: number
  notificationOpen?: boolean
  onNotificationOpenChange?: (open: boolean) => void
}

interface IconButtonProps {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}

function TitlebarIconButton({ label, active, disabled, onClick, children }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-md"
          disabled={disabled}
          onClick={onClick}
          className={cn("text-fg-weak", active && "bg-black/10 dark:bg-white/10")}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export function Titlebar({ sidebarCollapsed, onToggleSidebar, reviewOpen, onToggleReview, fileTreeOpen, onToggleFileTree, browserOpen, onToggleBrowser, terminalOpen, onToggleTerminal, hideFileTree, hideBrowser, hideTerminal, disabled, notificationCount, notificationOpen, onNotificationOpenChange }: TitlebarProps) {
  return (
    <header
      className="h-12 shrink-0 relative grid items-center border-b border-border-weak px-2"
      style={{ gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)" }}
      data-tauri-drag-region
    >
      {/* Left: traffic light spacer + sidebar toggle */}
      <div className="flex items-center min-w-0" data-tauri-drag-region>
        <div style={{ width: 80 }} className="shrink-0" data-tauri-drag-region />
        <TitlebarIconButton
          label={sidebarCollapsed ? "Show sessions" : "Hide sessions"}
          disabled={disabled}
          onClick={onToggleSidebar}
        >
          <Sidebar />
        </TitlebarIconButton>
        <NotificationPopover
          open={notificationOpen ?? false}
          onOpenChange={onNotificationOpenChange ?? (() => {})}
          onNavigateSession={(sessionId) => {
            window.dispatchEvent(new CustomEvent("navigate-session", { detail: { sessionId } }))
          }}
        >
          <Button variant="ghost" size="icon-md" className="relative" disabled={disabled}>
            <Bell className="text-fg-weak" />
            {(notificationCount ?? 0) > 0 && (
              <span className="absolute top-0.5 right-0.5 size-3.5 rounded-full bg-destructive text-destructive-foreground text-[9px] leading-none flex items-center justify-center font-medium">
                {notificationCount! > 99 ? "+" : notificationCount}
              </span>
            )}
          </Button>
        </NotificationPopover>
      </div>

      {/* Center: empty, draggable */}
      <div data-tauri-drag-region />

      {/* Right: Review + File Tree + Browser + Terminal */}
      <div className="flex items-center justify-end gap-1 min-w-0 pr-1" data-tauri-drag-region>
        <TitlebarIconButton
          label="Review changes"
          active={reviewOpen}
          disabled={disabled}
          onClick={onToggleReview}
        >
          <TextAlignLeft />
        </TitlebarIconButton>
        {!hideFileTree && (
          <TitlebarIconButton
            label="File tree"
            active={fileTreeOpen}
            disabled={disabled}
            onClick={onToggleFileTree}
          >
            <FolderOpen />
          </TitlebarIconButton>
        )}
        {!hideBrowser && (
          <TitlebarIconButton
            label="Browser"
            active={browserOpen}
            disabled={disabled}
            onClick={onToggleBrowser}
          >
            <Globe />
          </TitlebarIconButton>
        )}
        {!hideTerminal && (
          <TitlebarIconButton
            label="Terminal"
            active={terminalOpen}
            disabled={disabled}
            onClick={onToggleTerminal}
          >
            <Terminal />
          </TitlebarIconButton>
        )}
      </div>
    </header>
  )
}
