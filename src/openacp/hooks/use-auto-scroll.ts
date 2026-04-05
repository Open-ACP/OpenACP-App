/**
 * Auto-scroll hook: keeps the scroll container at the bottom while streaming.
 */
import { useState, useRef, useCallback, useEffect } from "react"

interface UseAutoScrollOptions {
  working: boolean
  bottomThreshold?: number
}

export function useAutoScroll(options: UseAutoScrollOptions) {
  const { working, bottomThreshold = 120 } = options
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [userScrolled, setUserScrolled] = useState(false)
  const skipNextScrollRef = useRef(false)

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < bottomThreshold
  }, [bottomThreshold])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    skipNextScrollRef.current = true
    el.scrollTop = el.scrollHeight
  }, [])

  const forceScrollToBottom = useCallback(() => {
    setUserScrolled(false)
    // Double rAF ensures the DOM has painted before scrolling
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToBottom)
    })
  }, [scrollToBottom])

  const resume = useCallback(() => {
    setUserScrolled(false)
    scrollToBottom()
  }, [scrollToBottom])

  // Always track scroll position, not just during streaming
  const handleScroll = useCallback(() => {
    if (skipNextScrollRef.current) {
      skipNextScrollRef.current = false
      return
    }
    if (!isNearBottom()) {
      setUserScrolled(true)
    } else {
      setUserScrolled(false)
    }
  }, [isNearBottom])

  const handleInteraction = useCallback(() => {
    // no-op, just provides a ref callback
  }, [])

  // Auto-scroll when working and content changes
  useEffect(() => {
    if (!working || userScrolled) return
    const content = contentRef.current
    if (!content) return

    const observer = new ResizeObserver(() => {
      if (!userScrolled) scrollToBottom()
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [working, userScrolled, scrollToBottom])

  return {
    scrollRef,
    contentRef,
    userScrolled: () => userScrolled,
    handleScroll,
    handleInteraction,
    forceScrollToBottom,
    resume,
  }
}
