// Stub bindings — OpenCode tauri-specta bindings replaced with OpenACP stubs
export type InitStep = { type: string; message: string }

export const commands = {
  awaitInitialization: async (_channel: any) => ({ url: "", username: "", password: "" }),
  getDefaultServerUrl: async () => null as string | null,
  setDefaultServerUrl: async (_url: string | null) => {},
  getWslConfig: async () => ({ enabled: false }),
  setWslConfig: async (_config: any) => {},
  getDisplayBackend: async () => null as string | null,
  setDisplayBackend: async (_backend: string | null) => {},
  parseMarkdownCommand: async (md: string) => md,
  killSidecar: async () => {},
  checkAppExists: async (_name: string) => false,
  openPath: async (_path: string, _app: string | null) => {},
  wslPath: async (path: string, _target: string) => path,
  installCli: async () => "",
}

export const events = {
  sqliteMigrationProgress: { listen: async (_fn: any) => ({ unsubscribe: () => {} }) },
}
