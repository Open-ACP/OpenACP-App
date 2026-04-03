import { useState, useEffect, useRef } from "react"

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

/**
 * Paces text updates for smooth streaming display.
 * When streaming, reveals text incrementally at word boundaries.
 */
export function usePacedValue(value: string, live?: boolean): string {
  const [display, setDisplay] = useState(value)
  const shownRef = useRef(value)
  const targetRef = useRef(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const clear = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }

  const sync = (text: string) => {
    shownRef.current = text
    setDisplay(text)
  }

  useEffect(() => {
    targetRef.current = value
    const shown = shownRef.current

    if (!live) {
      clear()
      sync(value)
      return
    }

    if (!value.startsWith(shown) || value.length < shown.length) {
      clear()
      sync(value)
      return
    }

    if (value.length === shown.length || timerRef.current != null) return

    const run = () => {
      timerRef.current = undefined
      const target = targetRef.current
      const current = shownRef.current

      if (!live) {
        sync(target)
        return
      }

      if (!target.startsWith(current) || target.length <= current.length) {
        sync(target)
        return
      }

      const end = next(target, current.length)
      sync(target.slice(0, end))
      if (end < target.length) {
        timerRef.current = setTimeout(run, PACE_MS)
      }
    }

    timerRef.current = setTimeout(run, PACE_MS)

    return clear
  }, [value, live])

  // Cleanup on unmount
  useEffect(() => clear, [])

  return display
}
