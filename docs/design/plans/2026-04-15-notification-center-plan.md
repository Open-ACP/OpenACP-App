# Notification Center Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app notification center with persistent storage, popover UI, badge count, and extensible action system.

**Architecture:** Three layers — persistence (Tauri store), React context (state + methods), UI (popover + sidebar bell icon). The system notification hook pushes to the notification context alongside OS notifications. Notifications are grouped by session then by time period.

**Tech Stack:** React, Tauri plugin-store, shadcn Popover, Phosphor icons

**Spec:** `docs/design/plans/2026-04-15-notification-center-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/openacp/api/notification-store.ts` | Create | Tauri store persistence — load, save, prune |
| `src/openacp/context/notifications.tsx` | Create | React context — state, methods, badge count |
| `src/openacp/components/notification-popover.tsx` | Create | Popover UI — grouped list, actions, empty state |
| `src/openacp/components/sidebar-rail.tsx` | Modify | Add bell icon with badge above Plugins |
| `src/openacp/hooks/use-system-notifications.ts` | Modify | Push to notification context on each event |
| `src/openacp/app.tsx` | Modify | Wrap with NotificationProvider, pass props |

---

## Task 1: Notification Store (persistence layer)

**Files:**
- Create: `src/openacp/api/notification-store.ts`

- [ ] **Step 1: Create notification-store.ts**

```ts
import { load } from "@tauri-apps/plugin-store"

export interface AppNotification {
  id: string
  type: "agent-response" | "permission-request" | "message-failed"
  sessionId?: string
  sessionName?: string
  title: string
  timestamp: number
  read: boolean
  action?: { type: string; payload?: Record<string, unknown> }
}

const STORE_NAME = "notifications.json"
const MAX_NOTIFICATIONS = 500
const TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

let store: Awaited<ReturnType<typeof load>> | null = null

async function getStore() {
  if (!store) store = await load(STORE_NAME)
  return store
}

function prune(list: AppNotification[]): AppNotification[] {
  const cutoff = Date.now() - TTL_MS
  const fresh = list.filter((n) => n.timestamp >= cutoff)
  if (fresh.length <= MAX_NOTIFICATIONS) return fresh
  return fresh.slice(fresh.length - MAX_NOTIFICATIONS)
}

export async function loadNotifications(): Promise<AppNotification[]> {
  try {
    const s = await getStore()
    const data = (await s.get("items")) as AppNotification[] | undefined
    return prune(data ?? [])
  } catch {
    return []
  }
}

export async function saveNotifications(items: AppNotification[]): Promise<void> {
  try {
    const s = await getStore()
    await s.set("items", items)
  } catch { /* non-critical */ }
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit 2>&1 | grep notification-store`
Expected: No output (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/openacp/api/notification-store.ts
git commit -m "feat(notifications): add persistence layer with TTL and prune"
```

---

## Task 2: Notification Context (React state)

**Files:**
- Create: `src/openacp/context/notifications.tsx`

- [ ] **Step 1: Create notifications.tsx context**

```tsx
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  loadNotifications,
  saveNotifications,
  type AppNotification,
} from "../api/notification-store"

interface NotificationsContext {
  notifications: AppNotification[]
  unreadCount: number
  append: (notification: Omit<AppNotification, "id" | "timestamp" | "read">) => void
  markRead: (id: string) => void
  markAllRead: () => void
  dismiss: (id: string) => void
  clearAll: () => void
}

const Ctx = createContext<NotificationsContext | undefined>(undefined)

export function useNotifications() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider")
  return ctx
}

let idCounter = 0
function nextId(): string {
  return `notif-${Date.now()}-${++idCounter}`
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<AppNotification[]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items

  // Load from store on mount
  useEffect(() => {
    void loadNotifications().then(setItems)
  }, [])

  // Auto-save on changes (skip initial empty state)
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return }
    void saveNotifications(items)
  }, [items])

  const append = useCallback((partial: Omit<AppNotification, "id" | "timestamp" | "read">) => {
    const notification: AppNotification = {
      ...partial,
      id: nextId(),
      timestamp: Date.now(),
      read: false,
    }
    setItems((prev) => [notification, ...prev])
  }, [])

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
  }, [])

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => n.read ? n : { ...n, read: true }))
  }, [])

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
  }, [])

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items])

  const value = useMemo((): NotificationsContext => ({
    notifications: items,
    unreadCount,
    append,
    markRead,
    markAllRead,
    dismiss,
    clearAll,
  }), [items, unreadCount, append, markRead, markAllRead, dismiss, clearAll])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit 2>&1 | grep "notifications.tsx"`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/openacp/context/notifications.tsx
git commit -m "feat(notifications): add React context with state management"
```

---

## Task 3: Wire NotificationsProvider into app.tsx

**Files:**
- Modify: `src/openacp/app.tsx`

- [ ] **Step 1: Import and wrap with provider**

In `src/openacp/app.tsx`:
- Add import: `import { NotificationsProvider } from "./context/notifications"`
- Wrap the app content (inside the outermost `<div>`) with `<NotificationsProvider>`. Place it high enough that both the sidebar rail and the system notifications hook can access it.

Find the pattern where other providers are nested and add `NotificationsProvider` as an outer wrapper.

- [ ] **Step 2: Verify app compiles**

Run: `npx tsc --noEmit 2>&1 | grep "app.tsx" | grep -v "pre-existing"`
Expected: Only pre-existing errors (has_config, parameter types), no new ones

- [ ] **Step 3: Commit**

```bash
git add src/openacp/app.tsx
git commit -m "feat(notifications): wire NotificationsProvider into app"
```

---

## Task 4: Integrate with system notifications hook

**Files:**
- Modify: `src/openacp/hooks/use-system-notifications.ts`

- [ ] **Step 1: Add notification context integration**

The hook needs to call `append()` from the notifications context when events fire. Since the hook is called inside a component that's wrapped by NotificationsProvider, it can use `useNotifications()`.

Change the hook signature to accept an `append` function parameter (to avoid circular dependency with context):

```ts
export function useSystemNotifications(
  appendNotification?: (n: Omit<AppNotification, "id" | "timestamp" | "read">) => void
)
```

In each event handler, after sending the OS notification (or even if OS notification is skipped because window is focused), call `appendNotification` if the setting for that event type is enabled:

- `handleAgentEvent` (usage event): append `{ type: "agent-response", title: "Agent response ready", sessionId, sessionName, action: { type: "navigate-session" } }`
- `handlePermissionRequest`: append `{ type: "permission-request", title: "Permission approval needed", sessionId, sessionName }`
- `handleMessageFailed`: append `{ type: "message-failed", title: "Message failed to process", sessionId }`

Key difference from OS notifications: in-app notifications should be appended **regardless of window focus** — they're history. Only OS notifications are gated by focus state.

- [ ] **Step 2: Update the hook call site in app.tsx**

Where `useSystemNotifications()` is called, pass the `append` from `useNotifications()`:

```ts
const { append: appendNotification } = useNotifications()
useSystemNotifications(appendNotification)
```

- [ ] **Step 3: Verify compiles**

Run: `npx tsc --noEmit 2>&1 | grep "use-system-notifications"`
Expected: No output

- [ ] **Step 4: Commit**

```bash
git add src/openacp/hooks/use-system-notifications.ts src/openacp/app.tsx
git commit -m "feat(notifications): push events to notification store from hook"
```

---

## Task 5: Notification Popover UI

**Files:**
- Create: `src/openacp/components/notification-popover.tsx`

- [ ] **Step 1: Create the popover component**

Build `NotificationPopover` with these sections:

**Header:**
- "Notifications" title (text-sm font-medium)
- "Mark all read" ghost button (disabled when no unread)
- "Clear all" ghost button (disabled when empty)

**Body (scrollable, max-h-96):**
- Group notifications: first by time period (Today / Yesterday / Older), within each period group by sessionId
- Each time group has a sticky header label (text-2xs text-muted-foreground uppercase)
- Each session subgroup shows session name as a subtle header
- Each item renders:
  - Unread dot (size-1.5 rounded-full bg-primary) on the left
  - Icon by type: `CheckCircle` (agent-response), `ShieldWarning` (permission-request), `XCircle` (message-failed) from @phosphor-icons/react
  - Title text (text-sm)
  - Relative time (text-2xs text-muted-foreground) — use simple formatter: "<1m", "Xm", "Xh", "Xd"
  - X dismiss button on hover (opacity-0 group-hover:opacity-100)
- Click handler: dispatch action (default navigate-session), mark read, close popover

**Empty state:**
- BellSimple icon (size-8 text-muted-foreground) + "No notifications yet" text

**Footer:**
- "Notification settings" link that dispatches `open-settings` event with page "notifications"

Use shadcn `Popover`, `PopoverTrigger`, `PopoverContent` from `./ui/popover`.

Component props:
```ts
interface NotificationPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigateSession?: (sessionId: string) => void
  children: React.ReactNode // trigger element (bell icon)
}
```

- [ ] **Step 2: Verify compiles**

Run: `npx tsc --noEmit 2>&1 | grep "notification-popover"`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/openacp/components/notification-popover.tsx
git commit -m "feat(notifications): add popover UI with grouped list"
```

---

## Task 6: Bell Icon on Sidebar Rail

**Files:**
- Modify: `src/openacp/components/sidebar-rail.tsx`

- [ ] **Step 1: Add bell icon with badge and popover**

In the bottom action buttons section of `SidebarRail` (the `shrink-0` div at line ~333), add a bell icon **above** the Plugins (PuzzlePiece) button.

Add to SidebarRail props:
```ts
notificationCount?: number
onOpenNotifications?: () => void
```

The bell icon:
- Uses `Bell` from `@phosphor-icons/react`
- Shows red badge with count when `notificationCount > 0`
- Badge: `absolute -top-0.5 -right-0.5 size-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center`
- Tooltip: "Notifications"

- [ ] **Step 2: Wire popover in app.tsx**

In `app.tsx` where `SidebarRail` is rendered:
- Add state: `const [notifOpen, setNotifOpen] = useState(false)`
- Wrap the bell icon area with `NotificationPopover`
- Pass `onNavigateSession` that switches active session via existing workspace/session switching logic
- Pass `notificationCount={unreadCount}` from `useNotifications()`

- [ ] **Step 3: Verify compiles and app runs**

Run: `npx tsc --noEmit 2>&1 | grep "sidebar-rail\|notification"`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/openacp/components/sidebar-rail.tsx src/openacp/app.tsx
git commit -m "feat(notifications): add bell icon with badge on sidebar rail"
```

---

## Task 7: Manual Testing & Polish

- [ ] **Step 1: Test notification flow end-to-end**

1. Send a prompt to agent, wait for response → notification should appear in popover
2. Trigger a permission request → notification appears
3. Check badge count updates
4. Click notification → navigates to session, marks read
5. "Mark all read" → clears all dots
6. Dismiss individual → removes item
7. "Clear all" → empty state
8. Restart app → notifications persist from store

- [ ] **Step 2: Test settings integration**

1. Disable "Agent response" in Settings > Notifications
2. Send prompt → no notification in center (and no OS notification)
3. Re-enable → notifications appear again

- [ ] **Step 3: Commit all polish**

```bash
git add -A
git commit -m "feat(notifications): notification center with popover, persistence, and settings"
```
