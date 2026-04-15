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
