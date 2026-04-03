import { createRoot } from "react-dom/client"
import { useState, useEffect, useMemo } from "react"
import "./styles.css"
import { commands, events, InitStep } from "./bindings"
import { Channel } from "@tauri-apps/api/core"
import { initI18n, t } from "./i18n"

const lines = [
  t("desktop.loading.status.initial"),
  t("desktop.loading.status.migrating"),
  t("desktop.loading.status.waiting"),
]
const delays = [3000, 9000]

void initI18n()

function LoadingScreen() {
  const [step, setStep] = useState<InitStep | null>(null)
  const [line, setLine] = useState(0)
  const [percent, setPercent] = useState(0)

  const phase = step?.phase
  const value = useMemo(() => {
    if (phase === "done") return 100
    return Math.max(25, Math.min(100, percent))
  }, [phase, percent])

  useEffect(() => {
    const channel = new Channel<InitStep>()
    channel.onmessage = (next) => setStep(next)
    commands.awaitInitialization(channel as any).catch(() => undefined)
  }, [])

  useEffect(() => {
    setLine(0)
    setPercent(0)
    const timers = delays.map((ms, i) => setTimeout(() => setLine(i + 1), ms))
    const listenerPromise = events.sqliteMigrationProgress.listen((e: any) => {
      if (e.payload.type === "InProgress") setPercent(Math.max(0, Math.min(100, e.payload.value)))
      if (e.payload.type === "Done") setPercent(100)
    })
    return () => {
      listenerPromise.then((cb) => cb())
      timers.forEach(clearTimeout)
    }
  }, [])

  useEffect(() => {
    if (phase !== "done") return
    const timer = setTimeout(() => events.loadingWindowComplete.emit(null), 1000)
    return () => clearTimeout(timer)
  }, [phase])

  const status = useMemo(() => {
    if (phase === "done") return t("desktop.loading.status.done")
    if (phase === "sqlite_waiting") return lines[line]
    return t("desktop.loading.status.initial")
  }, [phase, line])

  return (
    <div className="w-screen h-screen bg-background-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-11">
        <div className="w-20 h-25 opacity-15" aria-hidden="true">
          <svg viewBox="0 0 80 100" fill="currentColor" className="text-text-weak w-full h-full">
            <circle cx="40" cy="40" r="30" opacity="0.3" />
          </svg>
        </div>
        <div className="w-60 flex flex-col items-center gap-4" aria-live="polite">
          <span className="w-full overflow-hidden text-center text-ellipsis whitespace-nowrap text-text-strong text-14-normal">
            {status}
          </span>
          <div className="w-20 h-1 bg-surface-weak rounded-none overflow-hidden" aria-label={t("desktop.loading.progressAria")}>
            <div
              className="h-full bg-icon-warning-base rounded-none transition-all duration-300"
              style={{ width: `${value}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const root = document.getElementById("root")!
createRoot(root).render(<LoadingScreen />)
