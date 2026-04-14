import { useEffect, useRef } from 'react'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * System notifications for background events.
 * Shows native OS notifications only when the app window is not focused.
 *
 * Currently notifies on:
 * - Agent response complete (session goes idle after streaming)
 * - Permission request waiting for user action
 * - User mentioned by agent in a teamwork session
 */
export function useSystemNotifications() {
  const permittedRef = useRef<boolean | null>(null)
  const streamingRef = useRef(false)
  const focusedRef = useRef(true)

  // Request notification permission on mount + track window focus
  useEffect(() => {
    ;(async () => {
      let granted = await isPermissionGranted()
      if (!granted) {
        const result = await requestPermission()
        granted = result === 'granted'
      }
      permittedRef.current = granted

      // Track window focus via Tauri (more reliable than document.hasFocus)
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

  // Listen for agent events — notify when streaming ends (response complete)
  useEffect(() => {
    function handleAgentEvent(e: Event) {
      const { event } = (e as CustomEvent).detail ?? {}
      if (!event) return

      // Track streaming state
      if (event.type === 'text' || event.type === 'thought' || event.type === 'tool_call') {
        streamingRef.current = true
      }

      // usage event fires at the end of agent response — notify if window unfocused
      if (event.type === 'usage') {
        if (streamingRef.current && !focusedRef.current && permittedRef.current) {
          sendNotification({ title: 'OpenACP', body: 'Agent response ready' })
        }
        streamingRef.current = false
      }
    }

    function handlePermissionRequest() {
      if (!focusedRef.current && permittedRef.current) {
        sendNotification({ title: 'OpenACP', body: 'Permission approval needed' })
      }
    }

    window.addEventListener('agent-event', handleAgentEvent)
    window.addEventListener('permission-request', handlePermissionRequest)
    return () => {
      window.removeEventListener('agent-event', handleAgentEvent)
      window.removeEventListener('permission-request', handlePermissionRequest)
    }
  }, [])

  // Listen for mention notifications — show native notification when app is unfocused
  useEffect(() => {
    function handleMention(e: Event) {
      const data = (e as CustomEvent).detail as { text?: string; sessionId?: string } | undefined
      if (!data?.text) return

      if (!focusedRef.current && permittedRef.current) {
        sendNotification({ title: 'OpenACP', body: data.text })
      }
    }

    window.addEventListener('mention-notification', handleMention)
    return () => {
      window.removeEventListener('mention-notification', handleMention)
    }
  }, [])
}
