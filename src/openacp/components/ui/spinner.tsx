import React from "react"

const outerIndices = new Set([1, 2, 4, 7, 8, 11, 13, 14])
const cornerIndices = new Set([0, 3, 12, 15])
const squares = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  x: (i % 4) * 4,
  y: Math.floor(i / 4) * 4,
  delay: Math.random() * 1.5,
  duration: 1 + Math.random() * 1,
  outer: outerIndices.has(i),
  corner: cornerIndices.has(i),
}))

export function Spinner({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 15 15"
      data-component="spinner"
      className={className}
      style={style}
      fill="currentColor"
    >
      {squares.map((sq) => (
        <rect
          key={sq.id}
          x={sq.x}
          y={sq.y}
          width="3"
          height="3"
          rx="1"
          style={{
            opacity: sq.corner ? 0 : undefined,
            animation: sq.corner
              ? undefined
              : `${sq.outer ? "pulse-opacity-dim" : "pulse-opacity"} ${sq.duration}s ease-in-out infinite both`,
            animationDelay: sq.corner ? undefined : `${sq.delay}s`,
          }}
        />
      ))}
    </svg>
  )
}
