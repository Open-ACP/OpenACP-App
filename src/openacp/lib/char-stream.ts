// src/openacp/lib/char-stream.ts
//
// CharStream — single rAF drain loop for character-by-character streaming display.
//
// Usage:
//   charStream.pushChars("sess1:text", "hello world")
//   const unsub = charStream.subscribeDisplay("sess1:text", (text) => renderDOM(text))
//   charStream.flush("sess1:text")     // on stream end
//   charStream.clearStream("sess1:text") // after final render

type Stream = {
  buffer: string
  cursor: number
  listeners: Set<(displayText: string) => void>
}

// Tuned to real ACP stream data: avg chunk ≈ 44 chars every ~410ms ≈ 1.8 chars/frame @60fps.
// DRAIN_BASE_CHARS matches model output speed so each chunk "types out" smoothly before
// the next chunk arrives, instead of appearing all at once in a single frame.
const DRAIN_BASE_CHARS = 2   // chars revealed per frame at normal pace (~120 chars/sec @60fps)
const DRAIN_FAST_CHARS = 20  // chars revealed per frame when buffer is building up
const DRAIN_LAG_THRESHOLD = 100 // lag threshold (≈ 2 avg chunks) that triggers fast drain

const streams = new Map<string, Stream>()
let rafScheduled = false

function drain() {
  rafScheduled = false
  let anyPending = false

  for (const [, stream] of streams) {
    const lag = stream.buffer.length - stream.cursor
    if (lag === 0) continue

    const charsThisFrame = lag > DRAIN_LAG_THRESHOLD ? DRAIN_FAST_CHARS : DRAIN_BASE_CHARS
    stream.cursor = Math.min(stream.cursor + charsThisFrame, stream.buffer.length)
    const displayText = stream.buffer.slice(0, stream.cursor)
    for (const cb of stream.listeners) cb(displayText)

    if (stream.cursor < stream.buffer.length) anyPending = true
  }

  if (anyPending) {
    rafScheduled = true
    requestAnimationFrame(drain)
  }
}

function getOrCreate(streamId: string): Stream {
  let stream = streams.get(streamId)
  if (!stream) {
    stream = { buffer: "", cursor: 0, listeners: new Set() }
    streams.set(streamId, stream)
  }
  return stream
}

/** Append new chars to the stream buffer and start the rAF drain loop if not running. */
export function pushChars(streamId: string, text: string): void {
  const stream = getOrCreate(streamId)
  stream.buffer += text
  if (!rafScheduled) {
    rafScheduled = true
    requestAnimationFrame(drain)
  }
}

/**
 * Subscribe to display text updates. The callback is called on every rAF drain
 * with the currently revealed slice of the buffer.
 * Returns an unsubscribe function.
 *
 * If content has already been drained before this subscription (e.g. the component
 * mounted after the first few drain ticks), the callback is called immediately with
 * the current revealed slice so the subscriber never misses already-visible content.
 */
export function subscribeDisplay(
  streamId: string,
  cb: (displayText: string) => void,
): () => void {
  const stream = getOrCreate(streamId)
  stream.listeners.add(cb)

  // Deliver any content already revealed before this subscription was established
  if (stream.cursor > 0) {
    cb(stream.buffer.slice(0, stream.cursor))
  }

  // Resume drain if buffer has pending content but the loop has stopped
  if (stream.cursor < stream.buffer.length && !rafScheduled) {
    rafScheduled = true
    requestAnimationFrame(drain)
  }

  return () => stream.listeners.delete(cb)
}

/**
 * Immediately advance cursor to end of buffer and notify all listeners.
 * Call this when the stream is complete (usage/error/abort events).
 * Returns the full buffer text.
 */
export function flush(streamId: string): string {
  const stream = streams.get(streamId)
  if (!stream) return ""
  stream.cursor = stream.buffer.length
  const fullText = stream.buffer
  for (const cb of stream.listeners) cb(fullText)
  return fullText
}

/**
 * Remove the stream entry entirely.
 * Call after flush(), once the component has performed its final render.
 */
export function clearStream(streamId: string): void {
  streams.delete(streamId)
}
