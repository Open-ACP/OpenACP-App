import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useWorkspace } from "./workspace"
import { cacheSessions, loadCachedSessions } from "../api/session-cache"
import type { Session } from "../types"

interface SessionsContext {
  list: () => Session[]
  loading: () => boolean
  create: (agent?: string) => Promise<Session | null>
  remove: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  archive: (id: string) => Promise<void>
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
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // Persist sessions to cache whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      void cacheSessions(workspace.directory, sessions)
    }
  }, [sessions, workspace.directory])

  const refresh = useCallback(async () => {
    try {
      // Load cache first for instant display
      const cached = await loadCachedSessions(workspace.directory)
      if (cached && cached.length > 0 && sessionsRef.current.length === 0) {
        setSessions(cached)
      }

      const result = await workspace.client.listSessions()
      setSessions(
        result.sort((a: Session, b: Session) => {
          const aTime = new Date(a.lastActiveAt ?? a.createdAt).getTime()
          const bTime = new Date(b.lastActiveAt ?? b.createdAt).getTime()
          return bTime - aTime
        })
      )
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [workspace.client, workspace.directory])

  const create = useCallback(async (agent?: string): Promise<Session | null> => {
    try {
      const session = await workspace.client.createSession({ agent })
      setSessions((prev) => {
        if (prev.some((s) => s.id === session.id)) return prev
        return [session, ...prev]
      })
      return session
    } catch (e) {
      console.error("[sessions] create failed:", e)
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

  const rename = useCallback(async (id: string, name: string) => {
    await workspace.client.renameSession(id, name)
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name } : s))
  }, [workspace.client])

  const archive = useCallback(async (id: string) => {
    await workspace.client.archiveSession(id)
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
    rename,
    archive,
    refresh,
    upsert,
    delete: del,
  }), [sessions, loading, create, remove, rename, archive, refresh, upsert, del])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
