/**
 * Paced text rendering for smooth streaming.
 * Throttles text updates at 24ms intervals, snapping to word boundaries.
 * Ported from legacy src/ui/src/components/message-part.tsx
 */
import { createSignal, createEffect, onCleanup } from "solid-js"

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

export function createPacedValue(getValue: () => string, live?: () => boolean) {
  const [value, setValue] = createSignal(getValue())
  let shown = getValue()
  let timeout: ReturnType<typeof setTimeout> | undefined

  const clear = () => {
    if (!timeout) return
    clearTimeout(timeout)
    timeout = undefined
  }

  const sync = (text: string) => {
    shown = text
    setValue(text)
  }

  const run = () => {
    timeout = undefined
    const text = getValue()
    if (!live?.()) { sync(text); return }
    if (!text.startsWith(shown) || text.length <= shown.length) { sync(text); return }
    const end = next(text, shown.length)
    sync(text.slice(0, end))
    if (end < text.length) timeout = setTimeout(run, PACE_MS)
  }

  createEffect(() => {
    const text = getValue()
    if (!live?.()) { clear(); sync(text); return }
    if (!text.startsWith(shown) || text.length < shown.length) { clear(); sync(text); return }
    if (text.length === shown.length || timeout) return
    timeout = setTimeout(run, PACE_MS)
  })

  onCleanup(clear)

  return value
}
