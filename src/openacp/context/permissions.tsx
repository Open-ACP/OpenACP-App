import React, { createContext, useContext, useCallback, useRef } from "react"
import { useImmer } from "use-immer"
import { useWorkspace } from "./workspace"
import type { PermissionRequest } from "../types"

interface PermissionsContext {
  /** Get pending permission request for a session */
  pending: (sessionId: string) => PermissionRequest | undefined
  /** Handle incoming permission request from SSE */
  addRequest: (request: PermissionRequest) => void
  /** Resolve a permission (approve/deny) */
  resolve: (sessionId: string, permissionId: string, optionId: string) => Promise<void>
  /** Dismiss a pending permission (e.g. when aborting) */
  dismiss: (sessionId: string) => void
  /** Check if a specific permission is being resolved */
  resolving: (permissionId: string) => boolean
}

const Ctx = createContext<PermissionsContext | undefined>(undefined)

export function usePermissions() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("usePermissions must be used within PermissionsProvider")
  return ctx
}

interface PermissionsStore {
  /** sessionId → pending permission request */
  pending: Record<string, PermissionRequest>
  /** permissionId → currently resolving */
  resolving: Record<string, boolean>
}

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace()
  const [store, setStore] = useImmer<PermissionsStore>({ pending: {}, resolving: {} })

  const addRequest = useCallback((request: PermissionRequest) => {
    setStore((draft) => {
      draft.pending[request.sessionId] = request
    })
  }, [])

  const resolve = useCallback(async (sessionId: string, permissionId: string, optionId: string) => {
    setStore((draft) => { draft.resolving[permissionId] = true })
    try {
      await workspace.client.resolvePermission(sessionId, permissionId, optionId)
      setStore((draft) => {
        delete draft.pending[sessionId]
        delete draft.resolving[permissionId]
      })
    } catch {
      setStore((draft) => { delete draft.resolving[permissionId] })
    }
  }, [workspace.client])

  const dismiss = useCallback((sessionId: string) => {
    setStore((draft) => { delete draft.pending[sessionId] })
  }, [])

  const value: PermissionsContext = {
    pending: (sessionId) => store.pending[sessionId],
    addRequest,
    resolve,
    dismiss,
    resolving: (permissionId) => !!store.resolving[permissionId],
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
