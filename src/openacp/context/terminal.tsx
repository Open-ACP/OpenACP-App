import React, { createContext, useContext, useState, useCallback, useRef } from "react"
import { getPtyBackend, type PtyBackend } from "../lib/pty-backend"

export interface TerminalSession {
  id: string
  title: string
  cwd: string
}

interface TerminalContextValue {
  sessions: TerminalSession[]
  activeId: string | null
  backend: PtyBackend

  /** Create a new terminal session in the given directory */
  createSession: (cwd: string) => Promise<string>

  /** Close a terminal session */
  closeSession: (id: string) => Promise<void>

  /** Set the active terminal tab */
  setActiveId: (id: string | null) => void
}

const TerminalContext = createContext<TerminalContextValue | null>(null)

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const backendRef = useRef(getPtyBackend())
  const counterRef = useRef(0)

  const createSession = useCallback(async (cwd: string) => {
    const backend = backendRef.current
    const id = await backend.create({ cwd })

    counterRef.current += 1
    const title = `Terminal ${counterRef.current}`

    const session: TerminalSession = { id, title, cwd }
    setSessions((prev) => [...prev, session])
    setActiveId(id)
    return id
  }, [])

  const closeSession = useCallback(async (id: string) => {
    const backend = backendRef.current
    await backend.close(id).catch(() => {})

    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      // If we closed the active tab, switch to last remaining or null
      setActiveId((curr) => {
        if (curr !== id) return curr
        return next.length > 0 ? next[next.length - 1].id : null
      })
      return next
    })
  }, [])

  return (
    <TerminalContext.Provider
      value={{
        sessions,
        activeId,
        backend: backendRef.current,
        createSession,
        closeSession,
        setActiveId,
      }}
    >
      {children}
    </TerminalContext.Provider>
  )
}

export function useTerminal() {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider")
  return ctx
}
