/**
 * Paced text rendering for smooth streaming.
 * Throttles text updates at intervals, snapping to word boundaries.
 */
import { useState, useEffect, useRef, useCallback } from "react"

const PACE_MS = 24
const SNAP = /[\s.,!?;:)\]]/

function step(size: number) {
  if (size <= 12) return 4
  if (size <= 48) return 8
  if (size <= 96) return 16
  if (size <= 256) return 24
  return Math.min(48, Math.ceil(size / 6))
}

function next(text: string, start: number) {
  const end = Math.min(text.length, start + step(text.length - start))
  const max = Math.min(text.length, end + 8)
  for (let i = end; i < max; i++) {
    if (SNAP.test(text[i] ?? "")) return i + 1
  }
  return end
}

export function usePacedValue(value: string, live?: boolean): string {
  const [shown, setShown] = useState(value)
  const shownRef = useRef(value)
  const rafRef = useRef(0)
  const lastTimeRef = useRef(0)
  const valueRef = useRef(value)
  const liveRef = useRef(live)

  valueRef.current = value
  liveRef.current = live

  const sync = useCallback((text: string) => {
    shownRef.current = text
    setShown(text)
  }, [])

  useEffect(() => {
    if (!live) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      sync(value)
      return
    }

    // Text was replaced (not appended)
    if (!value.startsWith(shownRef.current) || value.length < shownRef.current.length) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      sync(value)
      return
    }

    // Already caught up or animation running
    if (value.length === shownRef.current.length || rafRef.current) return

    function tick(now: number) {
      if (!liveRef.current) {
        sync(valueRef.current)
        rafRef.current = 0
        return
      }

      const text = valueRef.current
      if (shownRef.current.length >= text.length) {
        rafRef.current = 0
        return
      }

      if (now - lastTimeRef.current >= PACE_MS) {
        lastTimeRef.current = now
        const end = next(text, shownRef.current.length)
        sync(text.slice(0, end))
      }

      if (shownRef.current.length < valueRef.current.length) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = 0
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [value, live, sync])

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return shown
}
