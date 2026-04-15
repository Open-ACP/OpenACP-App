import React, { useMemo } from "react"
import {
  CheckCircle,
  ShieldWarning,
  XCircle,
  At,
  BellSimple,
  X,
  Checks,
  Trash,
} from "@phosphor-icons/react"
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover"
import { Button } from "./ui/button"
import { useNotifications } from "../context/notifications"
import type { AppNotification } from "../api/notification-store"

interface NotificationPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigateSession?: (sessionId: string) => void
  children: React.ReactNode
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "<1m"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function getTimePeriod(ts: number): "Today" | "Yesterday" | "Older" {
  const now = new Date()
  const date = new Date(ts)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  if (date >= today) return "Today"
  if (date >= yesterday) return "Yesterday"
  return "Older"
}

function typeIcon(type: AppNotification["type"]) {
  switch (type) {
    case "agent-response":
      return <CheckCircle size={16} className="text-fg-weak shrink-0 mt-0.5" />
    case "permission-request":
      return <ShieldWarning size={16} className="text-warning shrink-0 mt-0.5" />
    case "message-failed":
      return <XCircle size={16} className="text-destructive shrink-0 mt-0.5" />
    case "mention":
      return <At size={16} className="text-primary shrink-0 mt-0.5" />
  }
}

type TimePeriod = "Today" | "Yesterday" | "Older"
const PERIOD_ORDER: TimePeriod[] = ["Today", "Yesterday", "Older"]

export function NotificationPopover({
  open,
  onOpenChange,
  onNavigateSession,
  children,
}: NotificationPopoverProps) {
  const { notifications, unreadCount, markRead, markAllRead, dismiss, clearAll } =
    useNotifications()

  const grouped = useMemo(() => {
    const map = new Map<TimePeriod, Map<string, AppNotification[]>>()
    for (const n of notifications) {
      const period = getTimePeriod(n.timestamp)
      if (!map.has(period)) map.set(period, new Map())
      const sessionMap = map.get(period)!
      const key = n.sessionId ?? "unknown"
      if (!sessionMap.has(key)) sessionMap.set(key, [])
      sessionMap.get(key)!.push(n)
    }
    return map
  }, [notifications])

  function handleClick(n: AppNotification) {
    markRead(n.id)
    const action = n.action ?? { type: "navigate-session" }
    if (action.type === "navigate-session" && n.sessionId) {
      onNavigateSession?.(n.sessionId)
    }
    onOpenChange(false)
  }

  function handleDismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    dismiss(id)
  }

  function handleSettingsClick() {
    window.dispatchEvent(
      new CustomEvent("open-settings", { detail: { page: "notifications" } }),
    )
    onOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        sideOffset={8}
        align="start"
        className="w-80 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-weak px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            Notifications
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Mark all read"
              disabled={unreadCount === 0}
              onClick={() => markAllRead()}
            >
              <Checks size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Clear all"
              disabled={notifications.length === 0}
              onClick={() => clearAll()}
            >
              <Trash size={14} />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto max-h-80 min-h-[200px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] gap-2">
              <BellSimple size={32} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                No notifications
              </span>
            </div>
          ) : (
            PERIOD_ORDER.filter((p) => grouped.has(p)).map((period) => {
              const sessionMap = grouped.get(period)!
              return (
                <div key={period}>
                  {/* Time period header */}
                  <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-1.5 bg-popover sticky top-0 z-10">
                    {period}
                  </div>
                  {Array.from(sessionMap.entries()).map(
                    ([sessionKey, items]) => (
                      <div key={sessionKey}>
                        {/* Session sub-header */}
                        {items[0]?.sessionName && (
                          <div className="text-2xs font-medium text-fg-weak px-4 py-1 pl-10">
                            {items[0].sessionName}
                          </div>
                        )}
                        {items.map((n) => (
                          <div
                            key={n.id}
                            className="group flex items-start gap-2 px-4 py-2 hover:bg-accent/50 cursor-pointer transition-colors"
                            onClick={() => handleClick(n)}
                          >
                            {/* Unread dot */}
                            {n.read ? (
                              <div className="size-1.5 shrink-0 mt-1.5" />
                            ) : (
                              <div className="size-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                            )}

                            {/* Type icon */}
                            {typeIcon(n.type)}

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-foreground truncate">
                                {n.title}
                              </div>
                              <div className="text-2xs text-muted-foreground truncate">
                                {[n.workspaceName, n.sessionName].filter(Boolean).join(" / ")}
                              </div>
                              <div className="text-2xs text-muted-foreground">
                                {relativeTime(n.timestamp)}
                              </div>
                            </div>

                            {/* Dismiss button */}
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              onClick={(e) => handleDismiss(e, n.id)}
                            >
                              <X size={14} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ),
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border-weak px-4 py-2 flex justify-center">
          <button
            className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={handleSettingsClick}
          >
            Notification settings
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
