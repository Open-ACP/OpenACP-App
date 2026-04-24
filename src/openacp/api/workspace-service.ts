/**
 * Workspace Service — CLI-first operations with filesystem fallback.
 *
 * Every public function:
 *  1. Tries the CLI command first (via invoke_cli)
 *  2. On failure, falls back to direct filesystem/Rust commands
 *  3. Returns typed results or throws typed errors (never swallows)
 */

import { invoke } from '@tauri-apps/api/core'
import { discoverLocalInstances, type InstanceListEntry, type WorkspaceEntry } from './workspace-store'

// ── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceStatus {
  has_config: boolean
  has_pid: boolean
  server_alive: boolean
  port: number | null
  instance_name: string | null
  instance_id: string | null
}

export interface CreateWorkspaceResult {
  id: string
  name: string
  directory: string
}

export class WorkspaceServiceError extends Error {
  constructor(
    message: string,
    public readonly code: 'CLI_NOT_FOUND' | 'CLI_FAILED' | 'ALREADY_EXISTS' | 'NOT_FOUND' | 'FILESYSTEM_ERROR' | 'UNKNOWN',
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'WorkspaceServiceError'
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLI_TIMEOUT_MS = 15000

async function invokeCli(args: string[]): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CLI_TIMEOUT_MS)
  try {
    return await invoke<string>('invoke_cli', { args })
  } catch (err) {
    const msg = typeof err === 'string' ? err : String(err)
    if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('could not find')) {
      throw new WorkspaceServiceError('OpenACP CLI not found — please install it first', 'CLI_NOT_FOUND', err)
    }
    throw new WorkspaceServiceError(msg, 'CLI_FAILED', err)
  } finally {
    clearTimeout(timer)
  }
}

function parseCliJson(stdout: string): any {
  try {
    const parsed = JSON.parse(stdout)
    return parsed?.data ?? parsed
  } catch {
    throw new WorkspaceServiceError(`CLI returned invalid JSON: ${stdout.slice(0, 200)}`, 'CLI_FAILED')
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Discover all registered workspace instances.
 * CLI-first: `openacp instances list --json`
 * Fallback: read ~/.openacp/instances.json via Rust
 */
export async function listWorkspaces(): Promise<InstanceListEntry[]> {
  try {
    return await discoverLocalInstances()
  } catch {
    return []
  }
}

/**
 * Get workspace status from filesystem (no CLI needed).
 */
export async function getWorkspaceStatus(directory: string): Promise<WorkspaceStatus> {
  return invoke<WorkspaceStatus>('get_workspace_status', { directory })
}

/**
 * Check if a server daemon is alive for a workspace directory.
 */
export async function isServerAlive(directory: string): Promise<boolean> {
  try {
    return await invoke<boolean>('check_workspace_server_alive', { directory })
  } catch {
    return false
  }
}

export type ClassifyDirectoryResult =
  | { type: 'registered'; instance: InstanceListEntry }
  | { type: 'unregistered'; directory: string }
  | { type: 'new'; directory: string }

/**
 * Check what kind of workspace a directory is.
 * Returns: 'registered' | 'unregistered' | 'new'
 */
export async function classifyDirectory(
  directory: string,
  knownInstances?: InstanceListEntry[],
): Promise<ClassifyDirectoryResult> {
  const instances = knownInstances ?? await listWorkspaces()

  // Check if already registered
  const match = instances.find(i => i.directory === directory)
  if (match) return { type: 'registered', instance: match }

  // Check if has .openacp config
  try {
    const hasConfig = await invoke<boolean>('path_exists', { path: `${directory}/.openacp/config.json` })
    if (hasConfig) return { type: 'unregistered', directory }
  } catch { /* ignore */ }

  return { type: 'new', directory }
}

/**
 * Register an existing workspace directory (has .openacp/ but not in instances.json).
 * CLI-first: `openacp instances create --dir <path> --no-interactive --json`
 * Fallback: discover instances and find by directory
 */
export async function registerWorkspace(directory: string): Promise<WorkspaceEntry> {
  // CLI first
  try {
    const stdout = await invokeCli(['instances', 'create', '--dir', directory, '--no-interactive', '--json'])
    const data = parseCliJson(stdout)
    return {
      id: data.id,
      name: data.name ?? data.id,
      directory: data.directory ?? directory,
      type: 'local',
    }
  } catch (cliErr) {
    // Fallback: read instance_id directly from config.json via get_workspace_status.
    // Works even when CLI is unavailable or reports the instance as already existing.
    // Path matching is intentionally avoided — config.json is the source of truth for id.
    try {
      const status = await invoke<WorkspaceStatus>('get_workspace_status', { directory })
      if (status.instance_id) {
        const dirBasename = (p: string) => p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
        return {
          id: status.instance_id,
          name: status.instance_name ?? dirBasename(directory),
          directory,
          type: 'local',
        }
      }
    } catch { /* fallback also failed */ }

    if (cliErr instanceof WorkspaceServiceError) throw cliErr
    throw new WorkspaceServiceError(
      `Failed to register workspace at ${directory}: ${cliErr}`,
      'CLI_FAILED',
      cliErr,
    )
  }
}

/**
 * Create a new workspace in a directory.
 * CLI: `openacp instances create --dir <path> [--from <source>] [--name <name>] --json`
 */
export async function createWorkspace(
  directory: string,
  options?: { name?: string; fromPath?: string },
): Promise<CreateWorkspaceResult> {
  const args = ['instances', 'create', '--dir', directory, '--no-interactive', '--json']
  if (options?.fromPath) args.push('--from', options.fromPath)
  if (options?.name) args.push('--name', options.name)

  const stdout = await invokeCli(args)
  const data = parseCliJson(stdout)
  return {
    id: data.id,
    name: data.name ?? data.id,
    directory: data.directory ?? directory,
  }
}

/**
 * Start the OpenACP server daemon for a workspace.
 * CLI: `openacp start --dir <path>`
 */
export async function startWorkspaceServer(directory: string): Promise<void> {
  await invokeCli(['start', '--dir', directory])
}

/**
 * Stop the OpenACP server daemon for a workspace.
 * CLI: `openacp stop --dir <path>`
 */
export async function stopWorkspaceServer(directory: string): Promise<void> {
  try {
    await invokeCli(['stop', '--dir', directory])
  } catch (err) {
    // Best-effort: server might already be stopped
    console.warn('[workspace-service] stop failed (may already be stopped):', err)
  }
}

/**
 * Restart the OpenACP server daemon.
 * CLI: `openacp restart --dir <path>`
 */
export async function restartWorkspaceServer(directory: string): Promise<void> {
  await invokeCli(['restart', '--dir', directory])
}
