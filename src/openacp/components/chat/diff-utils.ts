import { structuredPatch } from "diff"

export interface DiffLine {
  type: "add" | "del" | "normal" | "hunk"
  content: string
  oldNum?: number
  newNum?: number
}

/**
 * Computes a unified diff as an array of typed lines.
 * Pass empty string for `before` when the file is newly created (write tool).
 */
export function computeDiffLines(
  before: string,
  after: string,
  path: string,
): DiffLine[] {
  const patch = structuredPatch(path, path, before, after, "", "", { context: 3 })
  const lines: DiffLine[] = []
  for (const hunk of patch.hunks) {
    lines.push({
      type: "hunk",
      content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    })
    let oldNum = hunk.oldStart
    let newNum = hunk.newStart
    for (const line of hunk.lines) {
      if (line.startsWith("+"))
        lines.push({ type: "add", content: line.slice(1), newNum: newNum++ })
      else if (line.startsWith("-"))
        lines.push({ type: "del", content: line.slice(1), oldNum: oldNum++ })
      else
        lines.push({ type: "normal", content: line.slice(1), oldNum: oldNum++, newNum: newNum++ })
    }
  }
  return lines
}

/**
 * Slices a diff line array to at most `max` non-hunk content lines,
 * preserving hunk headers that appear before the cutoff.
 */
export function slicePreview(lines: DiffLine[], max: number): DiffLine[] {
  const result: DiffLine[] = []
  let contentCount = 0
  for (const line of lines) {
    if (contentCount >= max) break
    result.push(line)
    if (line.type !== "hunk") contentCount++
  }
  return result
}
