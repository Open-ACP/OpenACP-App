import { useState, useCallback, useRef, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { resolveWorkspaceServer } from '../context/workspace'
import { getKeychainToken } from '../api/keychain'
import type { WorkspaceEntry } from '../api/workspace-store'
import type { ServerInfo } from '../types'

// ── Types ────────────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

export interface WorkspaceConnectionState {
  status: ConnectionStatus
  server: ServerInfo | null
  error: string | null
  retryCount: number
}

interface UseWorkspaceConnectionReturn {
  state: WorkspaceConnectionState
  connect: () => Promise<void>
  disconnect: () => void
  startServer: () => Promise<void>
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 10
const BASE_RETRY_MS = 2000
const MAX_RETRY_MS = 10000
const HEALTH_TIMEOUT_MS = 8000

// ── Error classification ─────────────────────────────────────────────────────

type ErrorKind = 'retryable' | 'fatal'

function classifyError(err: unknown): { kind: ErrorKind; message: string } {
  const msg = typeof err === 'string' ? err : (err as any)?.message ?? String(err)
  const lower = msg.toLowerCase()

  // Fatal: no recovery without user action
  if (lower.includes('not found') || lower.includes('not installed')) {
    return { kind: 'fatal', message: msg }
  }
  if (lower.includes('permission denied') || lower.includes('eacces')) {
    return { kind: 'fatal', message: msg }
  }
  if (lower.includes('could not determine')) {
    return { kind: 'retryable', message: msg }
  }

  // Default: retryable (network issues, server starting, etc.)
  return { kind: 'retryable', message: msg }
}

function retryDelay(count: number): number {
  return Math.min(BASE_RETRY_MS + count * 1000, MAX_RETRY_MS)
}

// ── Health check with timeout ────────────────────────────────────────────────

async function checkHealth(server: ServerInfo): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    const res = await fetch(`${server.url}/api/v1/system/health`, {
      headers: server.token ? { Authorization: `Bearer ${server.token}` } : {},
      signal: controller.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// ── Server resolution: UUID → instances.json, fallback → filesystem ─────────

async function resolveServer(workspace: WorkspaceEntry): Promise<ServerInfo> {
  if (workspace.type === 'remote') {
    const jwt = await getKeychainToken(workspace.id)
    if (!jwt) throw new Error('No token found for remote workspace — re-authenticate')
    return { url: workspace.host ?? '', token: jwt }
  }

  // Primary: UUID → instances.json → read api.port + api-secret
  const info = await resolveWorkspaceServer(workspace.id)
  if (info) return info

  // Fallback: read directly from the workspace directory.
  // Used when instances.json is missing/stale (e.g. first run, registry deleted).
  // Identity stays UUID (workspace.id) — directory is only a filesystem pointer here.
  if (workspace.directory) {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      const dirInfo = await invoke<ServerInfo>('get_workspace_server_info_from_dir', {
        directory: workspace.directory,
      })
      if (dirInfo) return dirInfo
    } catch { /* fall through */ }
  }

  throw new Error(`Cannot resolve server for "${workspace.name || workspace.id}" — is the server running?`)
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useWorkspaceConnection(
  workspace: WorkspaceEntry | null,
  options?: {
    onConnected?: (server: ServerInfo) => void
    onDisconnected?: () => void
    onError?: (error: string) => void
  },
): UseWorkspaceConnectionReturn {
  const [state, setState] = useState<WorkspaceConnectionState>({
    status: 'idle',
    server: null,
    error: null,
    retryCount: 0,
  })

  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const cancelledRef = useRef(false)
  const workspaceIdRef = useRef<string | null>(null)

  // Stop retry loop
  const stopRetry = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = undefined
    }
  }, [])

  // Core connection attempt
  const attemptConnect = useCallback(async (ws: WorkspaceEntry, isRetry = false): Promise<boolean> => {
    try {
      const server = await resolveServer(ws)
      if (cancelledRef.current) return false

      const healthy = await checkHealth(server)
      if (cancelledRef.current) return false

      if (healthy) {
        setState({ status: 'connected', server, error: null, retryCount: 0 })
        options?.onConnected?.(server)
        return true
      }

      // Server resolved but health check failed
      throw new Error('Server found but health check failed — is it starting up?')
    } catch (err) {
      if (cancelledRef.current) return false
      const { kind, message } = classifyError(err)

      if (kind === 'fatal' || isRetry) {
        // Don't auto-retry fatal errors
        if (kind === 'fatal') {
          setState(prev => ({ ...prev, status: 'error', error: message, server: null }))
          options?.onError?.(message)
          return false
        }
      }
      // For retryable errors during initial connect, throw to let caller handle
      throw err
    }
  }, [options])

  // Auto-start server for local workspaces that aren't running
  const autoStartAttemptedRef = useRef(false)
  const tryAutoStart = useCallback(async (ws: WorkspaceEntry): Promise<void> => {
    if (ws.type !== 'local' || !ws.directory || autoStartAttemptedRef.current) return
    autoStartAttemptedRef.current = true
    console.log('[workspace-connection] auto-starting server for', ws.directory)
    try {
      await invoke<string>('invoke_cli', { args: ['start', '--dir', ws.directory] })
      // Give server time to boot
      await new Promise(r => setTimeout(r, 3000))
    } catch (err) {
      console.warn('[workspace-connection] auto-start failed (may already be running):', err)
    }
  }, [])

  // Start retry loop
  const startRetryLoop = useCallback((ws: WorkspaceEntry) => {
    stopRetry()

    function scheduleRetry(count: number) {
      if (count >= MAX_RETRIES) {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: `Failed to connect after ${MAX_RETRIES} attempts — try starting the server manually`,
        }))
        options?.onError?.(`Failed to connect after ${MAX_RETRIES} attempts`)
        return
      }

      setState(prev => ({ ...prev, status: 'reconnecting', retryCount: count }))

      retryTimerRef.current = setTimeout(async () => {
        if (cancelledRef.current) return
        const success = await attemptConnect(ws, true).catch(() => false)
        if (!success && !cancelledRef.current) {
          scheduleRetry(count + 1)
        }
      }, retryDelay(count))
    }

    scheduleRetry(0)
  }, [stopRetry, attemptConnect, options])

  // Public connect
  const connect = useCallback(async () => {
    if (!workspace) return
    cancelledRef.current = false
    stopRetry()

    setState({ status: 'connecting', server: null, error: null, retryCount: 0 })

    try {
      await attemptConnect(workspace)
    } catch (err) {
      if (cancelledRef.current) return
      const { kind, message } = classifyError(err)
      if (kind === 'fatal') {
        setState({ status: 'error', server: null, error: message, retryCount: 0 })
        options?.onError?.(message)
      } else {
        // For local workspaces: try auto-starting server before retry loop
        if (workspace.type === 'local' && workspace.directory) {
          await tryAutoStart(workspace)
          if (cancelledRef.current) return
          // Try once more after auto-start
          try {
            const success = await attemptConnect(workspace, true)
            if (success) return
          } catch { /* still failing, enter retry loop */ }
        }
        startRetryLoop(workspace)
      }
    }
  }, [workspace, stopRetry, attemptConnect, startRetryLoop, tryAutoStart, options])

  // Public disconnect
  const disconnect = useCallback(() => {
    cancelledRef.current = true
    stopRetry()
    setState({ status: 'idle', server: null, error: null, retryCount: 0 })
    options?.onDisconnected?.()
  }, [stopRetry, options])

  // Start server via CLI
  const startServer = useCallback(async () => {
    if (!workspace?.directory) return
    setState(prev => ({ ...prev, status: 'connecting', error: null }))
    try {
      await invoke<string>('invoke_cli', {
        args: ['start', '--dir', workspace.directory],
      })
      // Wait for server to boot
      await new Promise(r => setTimeout(r, 2000))
      // Try connecting
      await connect()
    } catch (err) {
      // Start may fail with "already running" — still try connecting
      await connect()
    }
  }, [workspace, connect])

  // Auto-connect when workspace changes
  useEffect(() => {
    const newId = workspace?.id ?? null
    if (newId === workspaceIdRef.current) return
    workspaceIdRef.current = newId

    // Cleanup previous
    cancelledRef.current = true
    stopRetry()
    autoStartAttemptedRef.current = false

    if (!workspace) {
      setState({ status: 'idle', server: null, error: null, retryCount: 0 })
      return
    }

    // Start fresh connection
    cancelledRef.current = false
    void connect()

    return () => {
      cancelledRef.current = true
      stopRetry()
    }
  }, [workspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reconnect on visibility change
  useEffect(() => {
    function handleVisibility() {
      if (
        document.visibilityState === 'visible' &&
        workspace &&
        (state.status === 'disconnected' || state.status === 'error')
      ) {
        void connect()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [workspace, state.status, connect])

  return { state, connect, disconnect, startServer }
}
