/**
 * Core version compatibility.
 *
 * The app declares the minimum version of the OpenACP Core CLI it requires.
 * Checked once at startup — if the installed core is below this, the app
 * shows a hard block screen until the user updates.
 *
 * Core CLI = server binary. All workspaces share one installation.
 * One check at startup covers everything.
 *
 * Format: YYYY.MDD.N (date-based, no leading zero on month)
 */

/** Minimum core version required. Hard block below this at startup. */
export const MIN_CORE_VERSION: string = '2026.413.1'

/**
 * Extract version number from CLI output (e.g. "openacp 2026.411.1" → "2026.411.1").
 * Returns the input as-is if no prefix is found.
 */
export function parseVersionString(raw: string): string {
  const match = raw.trim().match(/(\d+\.\d+\.\d+)/)
  return match ? match[1] : raw.trim()
}

/**
 * Compare two date-based version strings (YYYY.MDD.N).
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1
  }
  return 0
}
