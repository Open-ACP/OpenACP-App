# Notification Center — Design Spec

**Date:** 2026-04-15
**Status:** Approved

## Overview

In-app notification center that stores notification history, provides a popover UI for browsing/managing notifications, and integrates with the existing system notification hook and settings.

## UI Entry Point

- Bell icon on sidebar rail, positioned above the Plugins icon
- Red badge count when unread notifications exist
- Click opens a popover anchored to the icon

## Popover Layout

**Header:**
- "Notifications" title
- "Mark all read" button
- "Clear all" button

**Body:**
- Scrollable list, dual-grouped:
  - Primary: by session (avatar + session name, collapsible)
  - Secondary: by time period (Today / Yesterday / Older)
- Within each group: items sorted newest first
- Unread items have a dot indicator on the left

**Empty state:** Centered icon + "No notifications yet" text

**Footer:** "Notification settings" link that opens Settings > Notifications page

## Notification Item

Each item displays:
- **Icon** by type: CheckCircle (agent response), ShieldWarning (permission), XCircle (failed)
- **Title** text (e.g. "Agent response ready")
- **Session name** as subtitle
- **Relative timestamp** ("2m ago", "1h ago")
- **Unread dot** on the left edge
- **Dismiss button** (X icon) on hover — removes single item
- **Click action**: extensible action system. Default: navigate to session + mark read. Action is a typed object in notification data so future actions (open permission dialog, retry message, etc.) can be added without changing the component.

## Data Model

```ts
interface AppNotification {
  id: string
  type: "agent-response" | "permission-request" | "message-failed"
  sessionId?: string
  sessionName?: string
  title: string
  timestamp: number
  read: boolean
  /** Extensible action — default is navigate to session */
  action?: { type: string; payload?: Record<string, unknown> }
}
```

## Persistence

- **Store:** Tauri store (`notifications.json`) via `@tauri-apps/plugin-store`
- **TTL:** 30 days — prune expired items on load
- **Max:** 500 items — oldest pruned first when exceeded
- **Sync:** Auto-save on every mutation (same pattern as session cache)

## Architecture

### notification-store.ts
- `load()` / `save()` — read/write Tauri store with prune logic
- `append(notification)` — add new notification, trigger save
- `markRead(id)` / `markAllRead()` — update read status
- `dismiss(id)` / `clearAll()` — remove items
- Prune function: filter by TTL + cap at max count

### NotificationProvider (React context)
- Wraps notification-store with React state
- Provides: `notifications`, `unreadCount`, `append`, `markRead`, `markAllRead`, `dismiss`, `clearAll`
- Loads from store on mount, syncs on changes

### Integration with use-system-notifications.ts
- After sending OS notification, also call `append()` on NotificationProvider
- Both OS notifications and in-app notifications controlled by the same settings toggles

### NotificationPopover component
- Renders the popover UI
- Groups notifications by session, then by time period
- Handles click actions via action dispatcher (switch on action.type)
- Default action: navigate to session (switch active session via existing chat context)

### Bell icon on SidebarRail
- Shows badge with unread count
- Toggles popover open/close

## Action System

Actions are extensible via typed dispatch:

```ts
function handleNotificationClick(notification: AppNotification) {
  markRead(notification.id)
  const action = notification.action ?? { type: "navigate-session" }
  switch (action.type) {
    case "navigate-session":
      // switch to notification.sessionId
      break
    // Future: "open-permission", "retry-message", etc.
  }
}
```

New action types only require adding a case to the dispatcher — no component changes needed.

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/openacp/api/notification-store.ts` | Create — persistence layer |
| `src/openacp/context/notifications.tsx` | Create — React context provider |
| `src/openacp/components/notification-popover.tsx` | Create — popover UI |
| `src/openacp/components/sidebar-rail.tsx` | Modify — add bell icon with badge |
| `src/openacp/hooks/use-system-notifications.ts` | Modify — push to notification store |
| `src/openacp/app.tsx` | Modify — wrap with NotificationProvider |
