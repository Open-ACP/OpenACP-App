export const UPDATER_ENABLED = window.__OPENACP__?.updaterEnabled ?? false

export async function runUpdater({ alertOnFail }: { alertOnFail: boolean }) {
  // Open Settings > About instead of running inline update flow
  window.dispatchEvent(new CustomEvent('open-settings-about'))
}
