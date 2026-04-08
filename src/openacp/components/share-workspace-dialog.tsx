import React, { useState, useCallback } from "react"
import { Copy, Check, QrCode } from "@phosphor-icons/react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { useWorkspace } from "../context/workspace"
import { showToast } from "../lib/toast"

interface ShareWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onShared?: (link: string) => void
}

export function ShareWorkspaceDialog({ open, onOpenChange, onShared }: ShareWorkspaceDialogProps) {
  const workspace = useWorkspace()
  const [loading, setLoading] = useState(false)
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [role, setRole] = useState<"admin" | "operator" | "viewer">("operator")
  const [expire, setExpire] = useState("24h")
  const [showQr, setShowQr] = useState(false)

  const generateLink = useCallback(async () => {
    setLoading(true)
    try {
      // Get tunnel URL first
      const tunnel = await workspace.client.getTunnel()
      const host = tunnel.enabled && tunnel.url ? tunnel.url : workspace.server.url

      // Generate share code
      const { code } = await workspace.client.generateShareCode({
        role,
        name: `Shared from app`,
        expire,
      })

      const link = `openacp://connect?host=${encodeURIComponent(host)}&code=${code}`
      setShareLink(link)
      onShared?.(link)
    } catch (e: any) {
      showToast({ description: typeof e === "string" ? e : "Failed to generate share link" })
    } finally {
      setLoading(false)
    }
  }, [workspace.client, workspace.server, role, expire])

  const copyLink = useCallback(async () => {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast({ description: "Failed to copy" })
    }
  }, [shareLink])

  const handleOpenChange = useCallback((v: boolean) => {
    if (!v) {
      setShareLink(null)
      setCopied(false)
      setShowQr(false)
    }
    onOpenChange(v)
  }, [onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Share workspace</DialogTitle>
          <DialogDescription>
            Generate an invite link for others to connect to this workspace.
          </DialogDescription>
        </DialogHeader>

        {!shareLink ? (
          <>
            {/* Role selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-foreground-weak">Permission</label>
              <div className="flex gap-2">
                {(["admin", "operator", "viewer"] as const).map((r) => (
                  <button
                    key={r}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${role === r ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent"}`}
                    onClick={() => setRole(r)}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry selector */}
            <div className="flex flex-col gap-2">
              <label className="text-sm text-foreground-weak">Expires in</label>
              <div className="flex gap-2">
                {["1h", "24h", "7d", "30d"].map((e) => (
                  <button
                    key={e}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${expire === e ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent"}`}
                    onClick={() => setExpire(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button disabled={loading} onClick={generateLink}>
                {loading ? "Generating..." : "Generate link"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Generated link */}
            <div className="flex flex-col gap-3">
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted cursor-pointer overflow-hidden"
                onClick={copyLink}
              >
                <code className="flex-1 text-xs text-foreground truncate select-all min-w-0">{shareLink}</code>
                <button className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                </button>
              </div>

              {showQr && (
                <div className="flex justify-center p-4 bg-white rounded-md">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareLink)}`}
                    alt="QR Code"
                    className="size-48"
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setShowQr(!showQr)}>
                <QrCode size={14} className="mr-1.5" />
                {showQr ? "Hide QR" : "Show QR"}
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setShareLink(null)}>New link</Button>
              <Button onClick={copyLink}>
                {copied ? "Copied!" : "Copy link"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
