import { useState, useEffect, useRef, useCallback } from "react"

export interface UseAutoScrollOptions {
  working: boolean
  onUserInteracted?: () => void
  overflowAnchor?: "none" | "auto" | "dynamic"
  bottomThreshold?: number
}

export function useAutoScroll(options: UseAutoScrollOptions) {
  const { working, onUserInteracted, overflowAnchor = "dynamic", bottomThreshold = 10 } = options
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [userScrolled, setUserScrolled] = useState(false)

  const settlingRef = useRef(false)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const autoRef = useRef<{ top: number; time: number } | undefined>(undefined)
  const userScrolledRef = useRef(false)

  // Keep ref in sync with state
  userScrolledRef.current = userScrolled

  const active = working || settlingRef.current

  const distanceFromBottom = (el: HTMLElement) =>
    el.scrollHeight - el.clientHeight - el.scrollTop

  const canScroll = (el: HTMLElement) =>
    el.scrollHeight - el.clientHeight > 1

  const markAuto = useCallback((el: HTMLElement) => {
    autoRef.current = {
      top: Math.max(0, el.scrollHeight - el.clientHeight),
      time: Date.now(),
    }
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    autoTimerRef.current = setTimeout(() => {
      autoRef.current = undefined
      autoTimerRef.current = undefined
    }, 1500)
  }, [])

  const isAuto = useCallback((el: HTMLElement) => {
    const a = autoRef.current
    if (!a) return false
    if (Date.now() - a.time > 1500) {
      autoRef.current = undefined
      return false
    }
    return Math.abs(el.scrollTop - a.top) < 2
  }, [])

  const scrollToBottomNow = useCallback((behavior: ScrollBehavior) => {
    const el = scrollRef.current
    if (!el) return
    markAuto(el)
    if (behavior === "smooth") {
      el.scrollTo({ top: el.scrollHeight, behavior })
      return
    }
    el.scrollTop = el.scrollHeight
  }, [markAuto])

  const scrollToBottom = useCallback((force: boolean) => {
    if (!force && !active) return
    if (force && userScrolledRef.current) setUserScrolled(false)
    const el = scrollRef.current
    if (!el) return
    if (!force && userScrolledRef.current) return
    const distance = distanceFromBottom(el)
    if (distance < 2) {
      markAuto(el)
      return
    }
    scrollToBottomNow("auto")
  }, [active, markAuto, scrollToBottomNow])

  const stop = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (!canScroll(el)) {
      if (userScrolledRef.current) setUserScrolled(false)
      return
    }
    if (userScrolledRef.current) return
    setUserScrolled(true)
    onUserInteracted?.()
  }, [onUserInteracted])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    if (!canScroll(el)) {
      if (userScrolledRef.current) setUserScrolled(false)
      return
    }
    if (distanceFromBottom(el) < bottomThreshold) {
      if (userScrolledRef.current) setUserScrolled(false)
      return
    }
    if (!userScrolledRef.current && isAuto(el)) {
      scrollToBottom(false)
      return
    }
    stop()
  }, [bottomThreshold, isAuto, scrollToBottom, stop])

  const handleInteraction = useCallback(() => {
    if (!active) return
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) {
      stop()
    }
  }, [active, stop])

  const resume = useCallback(() => {
    if (userScrolledRef.current) setUserScrolled(false)
    scrollToBottom(true)
  }, [scrollToBottom])

  const forceScrollToBottom = useCallback(() => {
    scrollToBottom(true)
  }, [scrollToBottom])

  // Update overflow anchor on scroll element
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (overflowAnchor === "none") {
      el.style.overflowAnchor = "none"
    } else if (overflowAnchor === "auto") {
      el.style.overflowAnchor = "auto"
    } else {
      el.style.overflowAnchor = userScrolled ? "auto" : "none"
    }
  }, [userScrolled, overflowAnchor])

  // Wheel handler to detect upward scrolling
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY >= 0) return
      const target = e.target instanceof Element ? e.target : undefined
      const nested = target?.closest("[data-scrollable]")
      if (nested && nested !== el) return
      stop()
    }

    el.addEventListener("wheel", handleWheel, { passive: true })
    return () => el.removeEventListener("wheel", handleWheel)
  }, [stop])

  // Auto-scroll on content resize when working
  useEffect(() => {
    const content = contentRef.current
    if (!content || !working) return

    const observer = new ResizeObserver(() => {
      const el = scrollRef.current
      if (el && !canScroll(el)) {
        if (userScrolledRef.current) setUserScrolled(false)
        return
      }
      if (userScrolledRef.current) return
      scrollToBottom(false)
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [working, scrollToBottom])

  // Handle working state transitions (settling period)
  useEffect(() => {
    settlingRef.current = false
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = undefined

    if (working) {
      if (!userScrolledRef.current) scrollToBottom(true)
      return
    }

    settlingRef.current = true
    settleTimerRef.current = setTimeout(() => {
      settlingRef.current = false
    }, 300)

    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [working, scrollToBottom])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    }
  }, [])

  return {
    scrollRef,
    contentRef,
    userScrolled,
    handleScroll,
    handleInteraction,
    pause: stop,
    resume,
    scrollToBottom: () => scrollToBottom(false),
    forceScrollToBottom,
  }
}
