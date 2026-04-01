import { createContext, useContext, onMount, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
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

const Ctx = createContext<SessionsContext>()

export function useSessions() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSessions must be used within SessionsProvider")
  return ctx
}

export function SessionsProvider(props: ParentProps) {
  const workspace = useWorkspace()
  const [store, setStore] = createStore({
    sessions: [] as Session[],
    loading: true,
  })

  async function refresh() {
    try {
      const sessions = await workspace.client.listSessions()
      setStore("sessions", sessions.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ))
    } catch {
      setStore("sessions", [])
    } finally {
      setStore("loading", false)
    }
  }

  async function create(agent?: string): Promise<Session | null> {
    try {
      const session = await workspace.client.createSession({
        workspace: workspace.directory,
        agent,
      })
      // Only add if not already present (SSE session:created may have arrived first)
      setStore("sessions", (prev) => {
        if (prev.some((s) => s.id === session.id)) return prev
        return [session, ...prev]
      })
      return session
    } catch {
      return null
    }
  }

  async function remove(id: string) {
    try {
      await workspace.client.deleteSession(id)
      setStore("sessions", (prev) => prev.filter((s) => s.id !== id))
    } catch { /* silent */ }
  }

  function upsert(session: Session) {
    setStore("sessions", (prev) => {
      const idx = prev.findIndex((s) => s.id === session.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = session
        return next
      }
      return [session, ...prev]
    })
  }

  function del(id: string) {
    setStore("sessions", (prev) => prev.filter((s) => s.id !== id))
  }

  onMount(() => { void refresh() })

  const value: SessionsContext = {
    list: () => store.sessions,
    loading: () => store.loading,
    create,
    remove,
    refresh,
    upsert,
    delete: del,
  }

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}
