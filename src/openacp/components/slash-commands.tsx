import { createSignal, For, Show } from "solid-js"
import { Icon } from "@openacp/ui/icon"
import { useWorkspace } from "../context/workspace"
import { useChat } from "../context/chat"

interface ConfigChoice {
  value: string
  label: string
  description?: string
  current?: boolean
}

interface SlashCommand {
  id: string
  label: string
  description: string
}

const COMMANDS: SlashCommand[] = [
  { id: "mode", label: "/mode", description: "Change session mode" },
  { id: "model", label: "/model", description: "Change AI model" },
]

export function SlashCommandPopover(props: {
  query: string
  sessionID: string | undefined
  onSelect: (replacement: string) => void
  onClose: () => void
}) {
  const workspace = useWorkspace()
  const chat = useChat()
  const [step, setStep] = createSignal<"commands" | "options">("commands")
  const [activeCommand, setActiveCommand] = createSignal<string>("")
  const [options, setOptions] = createSignal<ConfigChoice[]>([])
  const [loading, setLoading] = createSignal(false)

  const filteredCommands = () => {
    const q = props.query.toLowerCase().replace("/", "")
    return COMMANDS.filter((c) => c.id.includes(q) || c.label.includes(q))
  }

  async function selectCommand(cmd: SlashCommand) {
    const sid = props.sessionID || chat.activeSession()
    if (!sid) {
      props.onClose()
      return
    }

    setActiveCommand(cmd.id)
    setLoading(true)

    try {
      const config = await workspace.client.getSessionConfig(sid)
      const configOption = config.configOptions?.find(
        (opt: any) => opt.category === cmd.id || opt.id === cmd.id
      )

      if (!configOption || configOption.type !== "select") {
        props.onClose()
        return
      }

      // Flatten options (may be grouped)
      const choices: ConfigChoice[] = []
      for (const opt of configOption.options || []) {
        if ("options" in opt && Array.isArray(opt.options)) {
          // Group
          for (const sub of opt.options) {
            choices.push({
              value: sub.value,
              label: sub.label || sub.value,
              description: sub.description,
              current: configOption.currentValue === sub.value,
            })
          }
        } else {
          choices.push({
            value: opt.value,
            label: opt.label || opt.value,
            description: opt.description,
            current: configOption.currentValue === opt.value,
          })
        }
      }

      setOptions(choices)
      setStep("options")
    } catch {
      props.onClose()
    } finally {
      setLoading(false)
    }
  }

  async function selectOption(choice: ConfigChoice) {
    const sid = props.sessionID || chat.activeSession()
    if (!sid) return

    try {
      await workspace.client.setSessionConfig(sid, activeCommand(), choice.value)
    } catch (e) {
      console.error("Failed to set config", e)
    }

    props.onSelect("")
    props.onClose()
  }

  return (
    <div class="w-72 max-h-64 overflow-y-auto rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 p-1">
      <Show when={loading()}>
        <div class="px-3 py-2 text-13-regular text-text-weak">Loading...</div>
      </Show>

      <Show when={!loading() && step() === "commands"}>
        <For each={filteredCommands()} fallback={
          <div class="px-3 py-2 text-13-regular text-text-weak">No commands</div>
        }>
          {(cmd) => (
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 rounded text-left text-13-regular text-text-base hover:bg-surface-raised-base-hover"
              onClick={() => selectCommand(cmd)}
            >
              <span class="text-13-medium text-text-strong">{cmd.label}</span>
              <span class="text-text-weak">{cmd.description}</span>
            </button>
          )}
        </For>
      </Show>

      <Show when={!loading() && step() === "options"}>
        <div class="px-3 py-1 text-12-medium text-text-weak capitalize">{activeCommand()}</div>
        <For each={options()}>
          {(opt) => (
            <button
              class="w-full flex items-center gap-2 px-3 py-1.5 rounded text-left text-13-regular hover:bg-surface-raised-base-hover"
              classList={{
                "text-text-strong": opt.current,
                "text-text-base": !opt.current,
              }}
              onClick={() => selectOption(opt)}
            >
              <Show when={opt.current}>
                <span class="text-text-interactive-base">✓</span>
              </Show>
              <span class="text-13-medium">{opt.label}</span>
              <Show when={opt.description}>
                <span class="text-text-weak truncate flex-1 min-w-0">{opt.description}</span>
              </Show>
            </button>
          )}
        </For>
      </Show>
    </div>
  )
}
