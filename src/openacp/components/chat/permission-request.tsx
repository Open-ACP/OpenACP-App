import React, { useState, useEffect, useRef } from "react"
import { usePermissions } from "../../context/permissions"
import { useChat } from "../../context/chat"
import { Button } from "../ui/button"

interface Props {
  sessionId: string
}

export function PermissionRequestCard({ sessionId }: Props) {
  const permissions = usePermissions()
  const chat = useChat()
  const request = permissions.pending(sessionId)
  const [feedback, setFeedback] = useState("")
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcuts
  useEffect(() => {
    if (!request) return
    function handleKey(e: KeyboardEvent) {
      // Number keys to select options
      const num = parseInt(e.key)
      if (num >= 1 && num <= request!.options.length) {
        e.preventDefault()
        const opt = request!.options[num - 1]
        permissions.resolve(sessionId, request!.id, opt.id)
        return
      }
      // Escape to deny (pick first deny option)
      if (e.key === "Escape") {
        e.preventDefault()
        const deny = request!.options.find((o) => !o.isAllow)
        if (deny) permissions.resolve(sessionId, request!.id, deny.id)
        return
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [request, sessionId])

  // Auto-focus card when permission appears
  useEffect(() => {
    if (request) cardRef.current?.focus()
  }, [request?.id])

  if (!request) return null

  const isResolving = permissions.resolving(request.id)

  async function handleFeedbackSubmit() {
    const text = feedback.trim()
    if (!text) return
    setFeedback("")
    // Deny permission with feedback — server will resolve the permission AND
    // queue feedback as next prompt in one atomic request
    const deny = request!.options.find((o) => !o.isAllow)
    if (deny) {
      await permissions.resolve(sessionId, request!.id, deny.id, text)
    }
  }

  return (
    <div
      ref={cardRef}
      data-component="oac-permission-request"
      tabIndex={-1}
      className="my-3 mx-0 rounded-lg overflow-hidden focus:outline-none"
      style={{
        background: "var(--secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Title */}
      <div className="px-3.5 pt-3 pb-2">
        <div className="text-sm-medium text-foreground">
          {request.description}
        </div>
      </div>

      {/* Options */}
      <div className="flex flex-col gap-0.5 px-2 pb-1.5">
        {request.options.map((opt, idx) => {
          const isFirst = idx === 0
          return (
            <Button
              key={opt.id}
              variant="ghost"
              disabled={isResolving}
              onClick={() => permissions.resolve(sessionId, request.id, opt.id)}
              onMouseEnter={() => setHighlighted(idx)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 h-auto justify-start text-left"
              style={{
                background: highlighted === idx
                  ? "var(--surface-interactive-subtle, rgba(100,116,139,0.25))"
                  : "var(--surface-inset-base)",
                border: "1px solid var(--border-weaker-base)",
              }}
            >
              <span
                className="text-sm-regular shrink-0"
                style={{ color: "var(--muted-foreground)", width: "14px" }}
              >
                {idx + 1}
              </span>
              <span className="text-sm-regular text-foreground">{opt.label}</span>
            </Button>
          )
        })}
      </div>

      {/* Feedback input */}
      <div className="px-2 pb-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Tell agent what to do instead"
          className="w-full bg-transparent text-sm-regular text-foreground placeholder:text-muted-foreground focus:outline-none rounded-md px-2.5 py-1.5"
          style={{
            background: "var(--surface-inset-base)",
            border: "1px solid var(--border-weaker-base)",
          }}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && feedback.trim()) {
              e.preventDefault()
              e.stopPropagation()
              handleFeedbackSubmit()
            }
            // Prevent number shortcuts when typing in input
            e.stopPropagation()
          }}
        />
      </div>

      {/* Hint */}
      <div className="px-3.5 pb-2.5">
        <span className="text-2xs-regular" style={{ color: "var(--foreground-weaker)" }}>
          Esc to cancel
        </span>
        {isResolving && (
          <span
            className="inline-block w-3 h-3 border-2 rounded-full oac-spinner ml-2 align-middle"
            style={{ borderColor: "var(--muted-foreground)", borderTopColor: "transparent" }}
          />
        )}
      </div>
    </div>
  )
}
