import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import { useWorkspace } from "./workspace"
import type { Session } from "../types"

interface SessionsContext {
  list: () => Session[]
  loading: () => boolean
  create: (agent?: string) => Promise<Session | null>
  remove: (id: string) => Promise<void>
  refresh: () => Promise<void>
  upsert: (session: Session) => void
  delete: (id: string) => void
}

const Ctx = createContext<SessionsContext | undefined>(undefined)

export function useSessions() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSessions must be used within SessionsProvider")
  return ctx
}

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const result = await workspace.client.listSessions()
      setSessions(
        result.sort((a: Session, b: Session) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      )
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [workspace.client])

  const create = useCallback(async (agent?: string): Promise<Session | null> => {
    try {
      const session = await workspace.client.createSession({ agent })
      setSessions((prev) => {
        if (prev.some((s) => s.id === session.id)) return prev
        return [session, ...prev]
      })
      return session
    } catch {
      return null
    }
  }, [workspace.client])

  const remove = useCallback(async (id: string) => {
    try {
      await workspace.client.deleteSession(id)
    } catch {
      // Server may fail but still remove locally
    }
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [workspace.client])

  const upsert = useCallback((session: Session) => {
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === session.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = session
        return next
      }
      return [session, ...prev]
    })
  }, [])

  const del = useCallback((id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo((): SessionsContext => ({
    list: () => sessions,
    loading: () => loading,
    create,
    remove,
    refresh,
    upsert,
    delete: del,
  }), [sessions, loading, create, remove, refresh, upsert, del])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
