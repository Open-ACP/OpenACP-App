import React, { useCallback } from "react"

export interface ResizeHandleProps {
  direction: "horizontal" | "vertical"
  edge?: "start" | "end"
  size: number
  min: number
  max: number
  onResize: (size: number) => void
  onCollapse?: () => void
  collapseThreshold?: number
  className?: string
}

export function ResizeHandle({
  direction,
  edge,
  size,
  min,
  max,
  onResize,
  onCollapse,
  collapseThreshold,
  className,
}: ResizeHandleProps) {
  const resolvedEdge = edge ?? (direction === "vertical" ? "start" : "end")

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const start = direction === "horizontal" ? e.clientX : e.clientY
      const startSize = size
      let current = startSize

      document.body.style.userSelect = "none"
      document.body.style.overflow = "hidden"

      const onMouseMove = (moveEvent: MouseEvent) => {
        const pos = direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
        const delta =
          direction === "vertical"
            ? resolvedEdge === "end"
              ? pos - start
              : start - pos
            : resolvedEdge === "start"
              ? start - pos
              : pos - start
        current = startSize + delta
        const clamped = Math.min(max, Math.max(min, current))
        onResize(clamped)
      }

      const onMouseUp = () => {
        document.body.style.userSelect = ""
        document.body.style.overflow = ""
        document.removeEventListener("mousemove", onMouseMove)
        document.removeEventListener("mouseup", onMouseUp)

        const threshold = collapseThreshold ?? 0
        if (onCollapse && threshold > 0 && current < threshold) {
          onCollapse()
        }
      }

      document.addEventListener("mousemove", onMouseMove)
      document.addEventListener("mouseup", onMouseUp)
    },
    [direction, resolvedEdge, size, min, max, onResize, onCollapse, collapseThreshold],
  )

  return (
    <div
      data-component="resize-handle"
      data-direction={direction}
      data-edge={resolvedEdge}
      className={className}
      onMouseDown={handleMouseDown}
    />
  )
}
