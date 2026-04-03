export type StartupScreen = 'splash' | 'install' | 'setup' | 'ready';

export interface StartupCheckResult {
  installed: boolean;
  configExists: boolean;
}

export function determineStartupScreen(result: StartupCheckResult): Exclude<StartupScreen, 'splash'> {
  if (!result.installed) return 'install';
  if (!result.configExists) return 'setup';
  return 'ready';
}
