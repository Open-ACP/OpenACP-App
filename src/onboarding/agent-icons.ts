import claudeIcon from "../assets/agents/claude.svg?raw"
import openaiIcon from "../assets/agents/openai.svg?raw"
import googlegeminiIcon from "../assets/agents/googlegemini.svg?raw"
import githubIcon from "../assets/agents/github.svg?raw"
import jetbrainsIcon from "../assets/agents/jetbrains.svg?raw"
import alibabacloudIcon from "../assets/agents/alibabacloud.svg?raw"

/**
 * Agent key → raw SVG markup. Keys match OpenACP CLI `agents list` output.
 * Rendered via dangerouslySetInnerHTML with `fill: currentColor` so the icon
 * inherits a neutral foreground token that adapts to light/dark themes.
 * Unmapped agents fall back to a colored initial avatar (setup-wizard.tsx).
 */
export const AGENT_ICONS: Record<string, string> = {
  "claude": claudeIcon,
  "codex": openaiIcon,
  "gemini": googlegeminiIcon,
  "copilot": githubIcon,
  "junie": jetbrainsIcon,
  "qwen": alibabacloudIcon,
}
