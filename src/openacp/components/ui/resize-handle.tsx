import React, { useCallback } from "react"

export interface ResizeHandleProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onResize"> {
  direction: "horizontal" | "vertical"
  edge?: "start" | "end"
  size: number
  min: number
  max: number
  onResize: (size: number) => void
  onCollapse?: () => void
  collapseThreshold?: number
}

export function ResizeHandle({
  direction,
  edge: edgeProp,
  size,
  min,
  max,
  onResize,
  onCollapse,
  collapseThreshold = 0,
  className,
  ...rest
}: ResizeHandleProps) {
  const resolvedEdge = edgeProp ?? (direction === "vertical" ? "start" : "end")

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

        if (onCollapse && collapseThreshold > 0 && current < collapseThreshold) {
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
      {...rest}
      data-component="resize-handle"
      data-direction={direction}
      data-edge={resolvedEdge}
      className={className}
      onMouseDown={handleMouseDown}
    />
  )
}
