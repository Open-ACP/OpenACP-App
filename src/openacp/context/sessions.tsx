import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useWorkspace } from "./workspace"
import { cacheSessions, loadCachedSessions } from "../api/session-cache"
import { clearCachedMessages } from "../api/history-cache"
import { showToast } from "../lib/toast"
import type { Session } from "../types"

interface SessionsContext {
  list: () => Session[]
  loading: () => boolean
  create: (agent?: string) => Promise<Session | null>
  remove: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  archive: (id: string) => Promise<void>
  refresh: () => Promise<void>
  upsert: (session: Partial<Session> & { id: string }) => void
  delete: (id: string) => void
}

const Ctx = createContext<SessionsContext | undefined>(undefined)

export function useSessions() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSessions must be used within SessionsProvider")
  return ctx
}

function sortSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    const aTime = new Date(a.lastActiveAt ?? a.createdAt).getTime()
    const bTime = new Date(b.lastActiveAt ?? b.createdAt).getTime()
    return bTime - aTime
  })
}

export function SessionsProvider({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // Track archived session IDs locally (server still returns them in listSessions)
  const archivedIdsRef = useRef<Set<string>>(new Set())

  // Persist sessions to cache whenever they change (including empty list)
  useEffect(() => {
    void cacheSessions(workspace.directory, sessions)
    // Broadcast session names for notification lookup (outside SessionsProvider)
    window.dispatchEvent(new CustomEvent("sessions-updated", {
      detail: sessions.map((s) => ({ id: s.id, name: s.name })),
    }))
  }, [sessions, workspace.directory])

  /** Fetch authoritative session list from server.
   *  Filters out cancelled sessions (archived sessions are cancelled on server)
   *  and any locally-archived IDs not yet cancelled. */
  const fetchFromServer = useCallback(async (): Promise<Session[] | null> => {
    try {
      const result = await workspace.client.listSessions()
      const archived = archivedIdsRef.current
      return sortSessions(
        result.filter((s) => s.status !== "cancelled" && !archived.has(s.id))
      )
    } catch {
      return null
    }
  }, [workspace.client])

  const refresh = useCallback(async () => {
    try {
      // Load cache first for instant display
      const cached = await loadCachedSessions(workspace.directory)
      if (cached && cached.length > 0 && sessionsRef.current.length === 0) {
        setSessions(cached)
      }

      // Server is authoritative — always replace
      const serverList = await fetchFromServer()
      if (serverList !== null) {
        setSessions(serverList)
      }
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [workspace.directory, fetchFromServer])

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

  /** Cancel = interrupt the running agent, session stays in list */
  const remove = useCallback(async (id: string) => {
    try {
      await workspace.client.deleteSession(id)
    } catch (e) {
      console.error("[sessions] cancel API failed:", e)
    }
    // Re-fetch to get updated status
    const serverList = await fetchFromServer()
    if (serverList !== null) {
      setSessions(serverList)
    }
  }, [workspace.client, fetchFromServer])

  const rename = useCallback(async (id: string, name: string) => {
    // Optimistic rename
    const previousName = sessionsRef.current.find((s) => s.id === id)?.name
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name } : s))

    try {
      await workspace.client.renameSession(id, name)
    } catch (e) {
      // Revert on failure
      if (previousName !== undefined) {
        setSessions((prev) => prev.map((s) => s.id === id ? { ...s, name: previousName } : s))
      }
      showToast({ description: "Failed to rename session" })
      console.error("[sessions] rename failed:", e)
    }
  }, [workspace.client])

  /** Archive = server cancels agent + removes session, then remove from UI */
  const archive = useCallback(async (id: string) => {
    // Track archived IDs locally (server still returns them in list)
    archivedIdsRef.current.add(id)

    // Optimistic: remove from UI
    setSessions((prev) => prev.filter((s) => s.id !== id))

    try {
      await workspace.client.archiveSession(id)
    } catch (e) {
      console.error("[sessions] archive failed:", e)
      showToast({ description: "Failed to archive session" })
      archivedIdsRef.current.delete(id)
    }

    // Clean up local message cache
    void clearCachedMessages(id).catch(() => {})
  }, [workspace.client])

  const upsert = useCallback((session: Partial<Session> & { id: string }) => {
    // Ignore archived/cancelled sessions
    if (archivedIdsRef.current.has(session.id) || session.status === "cancelled") return
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === session.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], ...session }
        return next
      }
      // Only insert if we have a full session object (not a partial update)
      if (session.createdAt) {
        return [session as Session, ...prev]
      }
      return prev
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
