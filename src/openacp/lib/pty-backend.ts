/**
 * PTY Backend Interface — abstraction layer for terminal I/O.
 *
 * Phase 1: TauriPtyBackend (local shell via Tauri commands)
 * Phase 2: ServerPtyBackend (remote PTY via OpenACP server WebSocket)
 */

export interface PtyBackend {
  /** Spawn a new PTY session. Returns session ID. */
  create(opts: { cwd: string; cols?: number; rows?: number }): Promise<string>

  /** Write user input to the PTY. */
  write(id: string, data: string): void

  /** Resize the PTY terminal. */
  resize(id: string, cols: number, rows: number): void

  /** Close and clean up the PTY session. */
  close(id: string): Promise<void>

  /** Subscribe to PTY output data. Returns unsubscribe function. */
  onData(id: string, callback: (data: string) => void): Promise<() => void>

  /** Subscribe to PTY exit event. Returns unsubscribe function. */
  onExit(id: string, callback: () => void): Promise<() => void>
}

/** Local PTY backend using Tauri commands + events. */
export class TauriPtyBackend implements PtyBackend {
  async create(opts: { cwd: string; cols?: number; rows?: number }): Promise<string> {
    const { invoke } = await import("@tauri-apps/api/core")
    return invoke<string>("pty_create", {
      cwd: opts.cwd,
      cols: opts.cols ?? 80,
      rows: opts.rows ?? 24,
    })
  }

  write(id: string, data: string): void {
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("pty_write", { id, data }).catch((e) =>
        console.error("[pty] write error:", e),
      )
    })
  }

  resize(id: string, cols: number, rows: number): void {
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("pty_resize", { id, cols, rows }).catch((e) =>
        console.error("[pty] resize error:", e),
      )
    })
  }

  async close(id: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core")
    await invoke("pty_close", { id })
  }

  async onData(id: string, callback: (data: string) => void): Promise<() => void> {
    const { listen } = await import("@tauri-apps/api/event")
    const unlisten = await listen<string>(`pty-output:${id}`, (event) => {
      callback(event.payload)
    })
    return unlisten
  }

  async onExit(id: string, callback: () => void): Promise<() => void> {
    const { listen } = await import("@tauri-apps/api/event")
    const unlisten = await listen(`pty-exit:${id}`, () => {
      callback()
    })
    return unlisten
  }
}

/** Singleton backend instance */
let _backend: PtyBackend | null = null

export function getPtyBackend(): PtyBackend {
  if (!_backend) {
    _backend = new TauriPtyBackend()
  }
  return _backend
}
