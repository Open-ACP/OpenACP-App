export type StartupScreen = 'splash' | 'install' | 'setup' | 'repair' | 'ready';

export interface StartupCheckResult {
  installed: boolean;
  version: string | null;
  configExists: boolean;
  hasWorkspaces: boolean;
  error?: string;
}

export function determineStartupScreen(result: StartupCheckResult): Exclude<StartupScreen, 'splash'> {
  // CLI not installed → install screen
  if (!result.installed) return 'install';

  // CLI installed but config missing → setup (first run or after reset)
  // hasWorkspaces is irrelevant here — stale entries will be cleared by main.tsx
  if (!result.configExists) return 'setup';

  // CLI error during check → repair
  if (result.error) return 'repair';

  // Config exists but no workspaces → setup (config created but no instance yet)
  if (!result.hasWorkspaces) return 'setup';

  return 'ready';
}
