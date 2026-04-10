import type { PlanEntry } from "../../types"

const KIND_MAP: Record<string, string> = {
  read: "read", grep: "search", glob: "search",
  edit: "edit", write: "write",
  bash: "execute", terminal: "execute",
  agent: "agent",
  skill: "skill",
  webfetch: "web", websearch: "web", web_fetch: "web", web_search: "web",
}

const KIND_ICONS: Record<string, string> = {
  read: "📖", search: "🔍", edit: "✏️", write: "📝",
  execute: "▶️", agent: "🧠", web: "🌐", skill: "⚡", other: "🔧",
}

const KIND_LABELS: Record<string, string> = {
  read: "Read", search: "Search", edit: "Edit", write: "Write",
  execute: "Bash", agent: "Agent", web: "Web", skill: "Skill", other: "Tool",
}

const NOISE_TOOLS = new Set(["glob", "grep", "ls"])

export function resolveKind(
  name: string, evtKind?: string, displayKind?: string,
  input?: Record<string, unknown> | null,
): string {
  if (displayKind) return displayKind
  // Detect kind from input fields — takes priority over generic evtKind
  if (input) {
    if (typeof input.subagent_type === "string" || typeof input.model === "string") return "agent"
    if (typeof input.skill === "string") return "skill"
  }
  if (evtKind) return evtKind
  const base = name.split(/[\s(/]/)[0].toLowerCase()
  return KIND_MAP[base] ?? "other"
}

export function kindIcon(kind: string): string {
  return KIND_ICONS[kind] ?? KIND_ICONS.other
}

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? KIND_LABELS.other
}

export function buildTitle(
  name: string, kind: string, input: Record<string, unknown> | null,
  displayTitle?: string, displaySummary?: string,
): string {
  if (displayTitle) return displayTitle
  if (displaySummary) return displaySummary

  // Extract title from input fields first
  if (input) {
    // For file tools: show just the filename, full path is still in tooltip
    const filePath = input.file_path ?? input.filePath ?? input.path
    if (typeof filePath === "string" && filePath) {
      return filePath.split("/").pop() ?? filePath
    }

    if (kind === "execute") {
      // description is more human-readable than raw command
      const desc = input.description
      if (typeof desc === "string" && desc) return desc.length > 60 ? desc.slice(0, 57) + "..." : desc
      const cmd = input.command ?? input.cmd
      if (typeof cmd === "string") return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd
    }
    if (kind === "search") {
      const pattern = input.pattern ?? input.query
      if (typeof pattern === "string") return `"${pattern}"`
    }
    if (kind === "agent") {
      const subagentType = input.subagent_type
      const model = input.model
      const desc = input.description
      // subagent_type takes priority over model as the prefix label; model is formatted as "(Sonnet)"
      const prefix = (typeof subagentType === "string" && subagentType) ? subagentType
        : (typeof model === "string" && model) ? `(${model.charAt(0).toUpperCase()}${model.slice(1)})`
        : null
      if (prefix) {
        if (typeof desc === "string" && desc) {
          const label = `${prefix}: ${desc}`
          return label.length > 70 ? label.slice(0, 67) + "..." : label
        }
        return prefix
      }
      if (typeof desc === "string" && desc) return desc.length > 70 ? desc.slice(0, 67) + "..." : desc
    }
    if (kind === "skill") {
      const skillName = input.skill ?? input.name
      if (typeof skillName === "string" && skillName) return skillName
    }
    if (kind === "web") {
      const url = input.url ?? input.query
      if (typeof url === "string" && url !== "undefined") return url.length > 60 ? url.slice(0, 57) + "..." : url
    }
  }

  // Fallback: if name contains description (e.g. "Read package.json"), strip the tool prefix
  const base = name.split(/[\s(/]/)[0].toLowerCase()
  if (KIND_MAP[base] && name.length > base.length + 1) {
    return name.slice(base.length).trim()
  }
  return name
}

export function extractDescription(input: Record<string, unknown> | null, title: string): string | null {
  if (!input) return null
  const desc = input.description
  if (typeof desc === "string" && desc !== title && desc.toLowerCase() !== title.toLowerCase()) return desc
  return null
}

export function extractCommand(kind: string, input: Record<string, unknown> | null): string | null {
  if (!input || kind !== "execute") return null
  const cmd = input.command ?? input.cmd
  return typeof cmd === "string" ? cmd : null
}

export function isNoiseTool(name: string, evtIsNoise?: boolean): boolean {
  if (evtIsNoise !== undefined) return evtIsNoise
  return NOISE_TOOLS.has(name.toLowerCase())
}

export function formatToolInput(input: Record<string, unknown> | null): string {
  if (!input) return ""
  const SKIP = new Set(["content", "new_string", "old_string", "patch", "data"])
  const lines: string[] = []
  for (const [key, value] of Object.entries(input)) {
    if (SKIP.has(key) || value === undefined || value === null) continue
    if (typeof value === "string") {
      lines.push(`${key}: ${value.length > 80 ? value.slice(0, 77) + "..." : value}`)
    } else if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${value}`)
    }
  }
  return lines.join("\n")
}

export function validatePlanEntries(raw: unknown[]): PlanEntry[] {
  const entries: PlanEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    if (typeof obj.content !== "string") continue
    const status = typeof obj.status === "string" ? obj.status : "pending"
    const validStatus = ["pending", "in_progress", "completed"].includes(status) ? status : "pending"
    entries.push({ content: obj.content, status: validStatus as PlanEntry["status"] })
  }
  return entries
}
