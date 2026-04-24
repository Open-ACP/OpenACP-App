import { useEffect } from "react"
import { playEventSound, preloadDefaultSounds } from "../lib/sound-player"

/**
 * Plays sound effects for background events.
 * Mirrors the event dispatch contract of `use-system-notifications.ts` —
 * both hooks listen to the same window events but handle different channels
 * (this one: audio; the other: visual toast + OS notification).
 */
export function useSoundEffects(): void {
  // Preload defaults once on mount to eliminate first-play latency.
  useEffect(() => {
    void preloadDefaultSounds()
  }, [])

  useEffect(() => {
    function handleAgentEvent(e: Event) {
      const { event } = (e as CustomEvent).detail ?? {}
      // "usage" fires once at end-of-turn — same marker used by notifications hook
      if (event?.type === "usage") void playEventSound("agentResponse")
    }
    function handlePermissionRequest() {
      void playEventSound("permissionRequest")
    }
    function handleMessageFailed() {
      void playEventSound("messageFailed")
    }
    function handleMention() {
      void playEventSound("mentionNotification")
    }

    window.addEventListener("agent-event", handleAgentEvent)
    window.addEventListener("permission-request", handlePermissionRequest)
    window.addEventListener("message-failed", handleMessageFailed)
    window.addEventListener("mention-notification", handleMention)

    return () => {
      window.removeEventListener("agent-event", handleAgentEvent)
      window.removeEventListener("permission-request", handlePermissionRequest)
      window.removeEventListener("message-failed", handleMessageFailed)
      window.removeEventListener("mention-notification", handleMention)
    }
  }, [])
}
