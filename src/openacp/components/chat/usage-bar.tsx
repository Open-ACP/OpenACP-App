import React from "react"
import type { UsageInfo } from "../../types"

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 10_000) return `${(count / 1_000).toFixed(1)}k`
  return count.toLocaleString()
}

function formatCost(cost: UsageInfo["cost"]): string | null {
  if (cost == null) return null
  if (typeof cost === "number") {
    return `$${cost.toFixed(4)}`
  }
  if (typeof cost === "object" && cost.amount != null) {
    const symbol = cost.currency === "USD" ? "$" : cost.currency + " "
    return `${symbol}${cost.amount.toFixed(4)}`
  }
  return null
}

function formatContext(size: number): string {
  if (size >= 1_000_000) return `${(size / 1_000_000).toFixed(1)}M ctx`
  if (size >= 1_000) return `${(size / 1_000).toFixed(1)}k ctx`
  return `${size.toLocaleString()} ctx`
}

interface UsageBarProps {
  usage: UsageInfo
}

export const UsageBar = React.memo(function UsageBar({ usage }: UsageBarProps) {
  const parts: string[] = []

  if (usage.tokensUsed != null && usage.tokensUsed > 0) {
    parts.push(`${formatTokens(usage.tokensUsed)} tokens`)
  }

  if (usage.contextSize != null && usage.contextSize > 0) {
    parts.push(formatContext(usage.contextSize))
  }

  const costStr = formatCost(usage.cost)
  if (costStr) {
    parts.push(costStr)
  }

  if (parts.length === 0) return null

  return (
    <span
      className="oac-usage-bar"
      style={{
        fontSize: 11,
        lineHeight: "16px",
        color: "var(--fg-weakest)",
        userSelect: "none",
      }}
    >
      {parts.join(" \u00B7 ")}
    </span>
  )
})
