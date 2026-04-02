// Keychain abstraction over Tauri keychain_set/get/delete commands.
// Key format: "workspace:<id>"
// Falls back to sessionStorage in dev/browser (tokens are NOT persisted to disk in fallback).

import { invoke } from '@tauri-apps/api/core'

function keychainKey(workspaceId: string): string {
  return `workspace:${workspaceId}`
}

export async function setKeychainToken(workspaceId: string, token: string): Promise<void> {
  const key = keychainKey(workspaceId)
  try {
    await invoke('keychain_set', { key, value: token })
    return
  } catch {}
  // Fallback: sessionStorage (non-persistent, cleared on close)
  try { sessionStorage.setItem(key, token) } catch {}
}

export async function getKeychainToken(workspaceId: string): Promise<string | null> {
  const key = keychainKey(workspaceId)
  try {
    const token = await invoke<string | null>('keychain_get', { key })
    if (token) return token
  } catch {}
  try { return sessionStorage.getItem(key) } catch { return null }
}

export async function deleteKeychainToken(workspaceId: string): Promise<void> {
  const key = keychainKey(workspaceId)
  try { await invoke('keychain_delete', { key }) } catch {}
  try { sessionStorage.removeItem(key) } catch {}
}
