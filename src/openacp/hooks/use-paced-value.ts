/**
 * Paced text rendering for smooth streaming.
 * Throttles text updates at 48ms intervals, snapping to word boundaries.
 */
import { useState, useEffect, useRef, useCallback } from "react"

const PACE_MS = 48
const SNAP = /[\s.,!?;:)\]]/

function step(size: number) {
  if (size <= 12) return 2
  if (size <= 48) return 4
  if (size <= 96) return 8
  if (size <= 256) return 16
  return Math.min(32, Math.ceil(size / 8))
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const valueRef = useRef(value)

  // Keep valueRef in sync
  valueRef.current = value

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = undefined
    }
  }, [])

  const sync = useCallback((text: string) => {
    shownRef.current = text
    setShown(text)
  }, [])

  const run = useCallback(() => {
    timeoutRef.current = undefined
    const text = valueRef.current
    if (!live) { sync(text); return }
    if (!text.startsWith(shownRef.current) || text.length <= shownRef.current.length) { sync(text); return }
    const end = next(text, shownRef.current.length)
    sync(text.slice(0, end))
    if (end < text.length) timeoutRef.current = setTimeout(run, PACE_MS)
  }, [live, sync])

  useEffect(() => {
    const text = value
    if (!live) { clear(); sync(text); return }
    if (!text.startsWith(shownRef.current) || text.length < shownRef.current.length) { clear(); sync(text); return }
    if (text.length === shownRef.current.length || timeoutRef.current) return
    timeoutRef.current = setTimeout(run, PACE_MS)
  }, [value, live, clear, sync, run])

  useEffect(() => {
    return clear
  }, [clear])

  return shown
}
