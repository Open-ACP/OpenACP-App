import { useEffect, useRef } from 'react'
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { toast } from 'sonner'
import { getSetting, type NotificationSettings } from '../lib/settings-store'
import type { AppNotification } from '../api/notification-store'

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
 *
 * Currently notifies on:
 * - Agent response complete (session goes idle after streaming)
 * - Permission request waiting for user action
 * - User mentioned by agent in a teamwork session (toast when focused, native when unfocused)
 */
export function useSystemNotifications(
  appendNotification?: (n: Omit<AppNotification, "id" | "timestamp" | "read">) => void,
  workspaceName?: string,
  getSessionName?: (sessionId: string) => string | undefined,
) {
  const permittedRef = useRef<boolean | null>(null)
  const streamingRef = useRef(false)
  const focusedRef = useRef(true)
  const settingsRef = useRef<NotificationSettings>(SETTING_DEFAULTS)
  const appendNotificationRef = useRef(appendNotification)
  appendNotificationRef.current = appendNotification
  const workspaceNameRef = useRef(workspaceName)
  workspaceNameRef.current = workspaceName
  const getSessionNameRef = useRef(getSessionName)
  getSessionNameRef.current = getSessionName

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
        if (settingsRef.current.enabled && settingsRef.current.agentResponse) {
          const sid = (e as CustomEvent).detail?.sessionId
          appendNotificationRef.current?.({
            type: "agent-response",
            title: "Agent response ready",
            sessionId: sid,
            sessionName: sid ? getSessionNameRef.current?.(sid) : undefined,
            workspaceName: workspaceNameRef.current,
            action: { type: "navigate-session" },
          })
        }
      }
    }

    function handlePermissionRequest(ev: Event) {
      if (canNotify() && settingsRef.current.permissionRequest) {
        sendNotification({ title: 'OpenACP', body: 'Permission approval needed' })
      }
      if (settingsRef.current.enabled && settingsRef.current.permissionRequest) {
        const detail = (ev as CustomEvent)?.detail
        appendNotificationRef.current?.({
          type: "permission-request",
          title: "Permission approval needed",
          sessionId: detail?.sessionId,
          sessionName: detail?.sessionId ? getSessionNameRef.current?.(detail.sessionId) : undefined,
          workspaceName: workspaceNameRef.current,
        })
      }
    }

    function handleMessageFailed(ev: Event) {
      if (canNotify() && settingsRef.current.messageFailed) {
        sendNotification({ title: 'OpenACP', body: 'Message failed to process' })
      }
      if (settingsRef.current.enabled && settingsRef.current.messageFailed) {
        const detail = (ev as CustomEvent)?.detail
        appendNotificationRef.current?.({
          type: "message-failed",
          title: "Message failed to process",
          sessionId: detail?.sessionId,
          sessionName: detail?.sessionId ? getSessionNameRef.current?.(detail.sessionId) : undefined,
          workspaceName: workspaceNameRef.current,
        })
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

  // Listen for mention notifications — native notification when unfocused, toast when focused
  useEffect(() => {
    function handleMention(e: Event) {
      const data = (e as CustomEvent).detail as { text?: string; sessionId?: string } | undefined
      if (!data?.text) return

      if (!focusedRef.current && !!permittedRef.current && settingsRef.current.enabled) {
        sendNotification({ title: 'OpenACP', body: data.text })
      } else if (data.sessionId) {
        toast(data.text, {
          action: {
            label: 'View',
            onClick: () => window.dispatchEvent(
              new CustomEvent('navigate-to-session', { detail: { sessionId: data.sessionId } })
            ),
          },
        })
      } else {
        toast(data.text)
      }

      // Push to in-app notification center
      if (settingsRef.current.enabled) {
        appendNotificationRef.current?.({
          type: "mention",
          title: data.text,
          sessionId: data.sessionId,
          sessionName: data.sessionId ? getSessionNameRef.current?.(data.sessionId) : undefined,
          workspaceName: workspaceNameRef.current,
          action: data.sessionId ? { type: "navigate-session" } : undefined,
        })
      }
    }

    window.addEventListener('mention-notification', handleMention)
    return () => {
      window.removeEventListener('mention-notification', handleMention)
    }
  }, [])
}
