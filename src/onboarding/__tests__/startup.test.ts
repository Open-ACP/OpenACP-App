/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { determineStartupScreen } from '../startup.js';

describe('determineStartupScreen', () => {
  it('returns "install" when openacp is not installed', () => {
    expect(determineStartupScreen({ installed: false, configExists: false, version: null, hasWorkspaces: false })).toBe('install');
  });

  it('returns "setup" when installed but no config', () => {
    expect(determineStartupScreen({ installed: true, configExists: false, version: '1.0.0', hasWorkspaces: false })).toBe('setup');
  });

  it('returns "ready" when installed and config exists', () => {
    expect(determineStartupScreen({ installed: true, configExists: true, version: '1.0.0', hasWorkspaces: true })).toBe('ready');
  });
});
