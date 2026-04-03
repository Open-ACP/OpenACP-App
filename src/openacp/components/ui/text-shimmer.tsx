import React from "react"

interface TextShimmerProps {
  text: string
  active?: boolean
  className?: string
  style?: React.CSSProperties
}

export function TextShimmer({ text, active, className, style }: TextShimmerProps) {
  if (!active) {
    return (
      <span className={className} style={style}>
        {text}
      </span>
    )
  }

  return (
    <span className={className} style={{ ...style, opacity: 0.7 }}>
      <span style={{ animation: "oac-shimmer 1.5s ease-in-out infinite" }}>{text}</span>
    </span>
  )
}
