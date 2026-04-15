import { useEffect, useRef } from 'react'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { getSetting, type NotificationSettings } from '../lib/settings-store'

const SETTING_DEFAULTS: NotificationSettings = {
  enabled: true,
  agentResponse: true,
  permissionRequest: true,
  messageFailed: true,
}

/**
 * System notifications for background events.
 * Shows native OS notifications only when the app window is not focused
 * and the corresponding notification setting is enabled.
 */
export function useSystemNotifications() {
  const permittedRef = useRef<boolean | null>(null)
  const streamingRef = useRef(false)
  const focusedRef = useRef(true)
  const settingsRef = useRef<NotificationSettings>(SETTING_DEFAULTS)

  // Load notification settings + request OS permission + track window focus
  useEffect(() => {
    ;(async () => {
      // Load settings
      const s = await getSetting('notifications')
      settingsRef.current = { ...SETTING_DEFAULTS, ...s }

      // Request OS permission
      let granted = await isPermissionGranted()
      if (!granted) {
        const result = await requestPermission()
        granted = result === 'granted'
      }
      permittedRef.current = granted

      // Track window focus via Tauri
      focusedRef.current = await getCurrentWindow().isFocused()
    })()

    const unlisteners: (() => void)[] = []
    ;(async () => {
      const win = getCurrentWindow()
      unlisteners.push(await win.onFocusChanged(({ payload }) => {
        focusedRef.current = payload
      }))
    })()

    return () => { unlisteners.forEach(fn => fn()) }
  }, [])

  // Reload settings when they change
  useEffect(() => {
    function handleSettingsChanged() {
      void getSetting('notifications').then((s) => {
        settingsRef.current = { ...SETTING_DEFAULTS, ...s }
      })
    }

    window.addEventListener('settings-changed', handleSettingsChanged)
    return () => window.removeEventListener('settings-changed', handleSettingsChanged)
  }, [])

  // Listen for events and notify based on settings
  useEffect(() => {
    function canNotify(): boolean {
      return !focusedRef.current && !!permittedRef.current && settingsRef.current.enabled
    }

    function handleAgentEvent(e: Event) {
      const { event } = (e as CustomEvent).detail ?? {}
      if (!event) return

      // Track streaming state
      if (event.type === 'text' || event.type === 'thought' || event.type === 'tool_call') {
        streamingRef.current = true
      }

      // usage event fires at the end of agent response
      if (event.type === 'usage') {
        if (streamingRef.current && canNotify() && settingsRef.current.agentResponse) {
          sendNotification({ title: 'OpenACP', body: 'Agent response ready' })
        }
        streamingRef.current = false
      }
    }

    function handlePermissionRequest() {
      if (canNotify() && settingsRef.current.permissionRequest) {
        sendNotification({ title: 'OpenACP', body: 'Permission approval needed' })
      }
    }

    function handleMessageFailed() {
      if (canNotify() && settingsRef.current.messageFailed) {
        sendNotification({ title: 'OpenACP', body: 'Message failed to process' })
      }
    }

    window.addEventListener('agent-event', handleAgentEvent)
    window.addEventListener('permission-request', handlePermissionRequest)
    window.addEventListener('message-failed', handleMessageFailed)
    return () => {
      window.removeEventListener('agent-event', handleAgentEvent)
      window.removeEventListener('permission-request', handlePermissionRequest)
      window.removeEventListener('message-failed', handleMessageFailed)
    }
  }, [])
}
