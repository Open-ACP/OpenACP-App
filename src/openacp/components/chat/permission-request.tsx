import React from "react"
import { ShieldWarning } from "@phosphor-icons/react"
import { usePermissions } from "../../context/permissions"
import type { PermissionRequest as PermissionRequestType } from "../../types"

interface Props {
  sessionId: string
}

export function PermissionRequestCard({ sessionId }: Props) {
  const permissions = usePermissions()
  const request = permissions.pending(sessionId)

  if (!request) return null

  const isResolving = permissions.resolving(request.id)
  const allowOptions = request.options.filter((o) => o.isAllow)
  const denyOptions = request.options.filter((o) => !o.isAllow)

  return (
    <div
      data-component="oac-permission-request"
      className="my-3 mx-0 rounded-lg border overflow-hidden"
      style={{
        borderColor: "var(--border-warning-base, var(--border-base))",
        background: "var(--surface-warning-subtle, var(--surface-raised-base))",
      }}
    >
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <div
          className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: "var(--surface-warning-base, rgba(234,179,8,0.15))" }}
        >
          <ShieldWarning size={14} weight="fill" style={{ color: "var(--text-warning-base, #ca8a04)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-12-medium" style={{ color: "var(--text-warning-strong, var(--text-strong))" }}>
            Permission Required
          </div>
          <div className="text-13-regular mt-0.5" style={{ color: "var(--text-base)" }}>
            {request.description}
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-2 px-3.5 py-2.5 border-t"
        style={{ borderColor: "var(--border-warning-base, var(--border-weaker-base))", background: "var(--surface-raised-base)" }}
      >
        {allowOptions.map((opt) => (
          <button
            key={opt.id}
            disabled={isResolving}
            onClick={() => permissions.resolve(sessionId, request.id, opt.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-12-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--surface-positive-base, #16a34a)",
              color: "var(--text-on-fill, #fff)",
            }}
          >
            {opt.label}
          </button>
        ))}
        {denyOptions.map((opt) => (
          <button
            key={opt.id}
            disabled={isResolving}
            onClick={() => permissions.resolve(sessionId, request.id, opt.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-12-medium transition-colors disabled:opacity-50"
            style={{
              background: "var(--surface-critical-base, #dc2626)",
              color: "var(--text-on-fill, #fff)",
            }}
          >
            {opt.label}
          </button>
        ))}
        {isResolving && (
          <div
            className="w-3.5 h-3.5 border-2 rounded-full oac-spinner ml-1"
            style={{ borderColor: "var(--text-weak)", borderTopColor: "transparent" }}
          />
        )}
      </div>
    </div>
  )
}
