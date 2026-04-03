import React, { useState, useEffect, useRef, useMemo } from "react"

interface TextShimmerProps {
  text: string
  className?: string
  as?: React.ElementType
  active?: boolean
  offset?: number
  style?: React.CSSProperties
}

export function TextShimmer({
  text,
  className,
  as: Component = "span",
  active = true,
  offset = 0,
  style,
}: TextShimmerProps) {
  const swap = 220
  const [run, setRun] = useState(active)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
    }

    if (active) {
      setRun(true)
      return
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = undefined
      setRun(false)
    }, swap)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [active])

  const combinedStyle = useMemo(
    () => ({
      ...style,
      "--text-shimmer-swap": `${swap}ms`,
      "--text-shimmer-index": `${offset}`,
    } as React.CSSProperties),
    [style, offset],
  )

  return (
    <Component
      data-component="text-shimmer"
      data-active={active ? "true" : "false"}
      className={className}
      aria-label={text}
      style={combinedStyle}
    >
      <span data-slot="text-shimmer-char">
        <span data-slot="text-shimmer-char-base" aria-hidden="true">
          {text}
        </span>
        <span data-slot="text-shimmer-char-shimmer" data-run={run ? "true" : "false"} aria-hidden="true">
          {text}
        </span>
      </span>
    </Component>
  )
}
