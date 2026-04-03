import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import fs from "node:fs"

const host = process.env.TAURI_DEV_HOST

// Custom resolver that maps @openacp/* package imports to local copies
function openacpResolver() {
  const uiComponents = path.resolve(__dirname, "src/ui/src/components")
  const uiSrc = path.resolve(__dirname, "src/ui/src")
  const appSrc = path.resolve(__dirname, "src/app")
  const utilSrc = path.resolve(__dirname, "src/util/src")
  const sdkSrc = path.resolve(__dirname, "src/openacp-sdk")

  return {
    name: "openacp-resolver",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
      // @openacp/ui/* → src/ui/src/components/*.tsx or src/ui/src/*
      if (source.startsWith("@openacp/ui/")) {
        const rest = source.slice("@openacp/ui/".length)

        // Special paths
        if (rest === "styles") return path.join(uiSrc, "styles/index.css")
        if (rest.startsWith("styles/")) return path.join(uiSrc, rest + "/index.css")
        if (rest === "theme") return path.join(uiSrc, "theme/index.ts")
        if (rest.startsWith("theme/")) {
          const tsx = path.join(uiSrc, rest + ".tsx")
          if (fs.existsSync(tsx)) return tsx
          return path.join(uiSrc, rest + ".ts")
        }
        if (rest === "hooks") return path.join(uiSrc, "hooks/index.ts")
        if (rest === "context") return path.join(uiSrc, "context/index.ts")
        if (rest.startsWith("context/")) return path.join(uiSrc, rest + ".tsx")
        if (rest.startsWith("i18n/")) return path.join(uiSrc, rest + ".ts")
        if (rest === "pierre") return path.join(uiSrc, "pierre/index.ts")
        if (rest.startsWith("pierre/")) return path.join(uiSrc, rest + ".ts")
        if (rest === "icons/provider") return path.join(uiSrc, "components/provider-icons/types.ts")

        // Default: component import → src/ui/src/components/<name>.tsx
        const tsxPath = path.join(uiComponents, rest + ".tsx")
        if (fs.existsSync(tsxPath)) return tsxPath
        const tsPath = path.join(uiComponents, rest + ".ts")
        if (fs.existsSync(tsPath)) return tsPath

        return null
      }

      // @openacp/app → src/app-src/index.ts
      if (source === "@openacp/app") return path.join(appSrc, "index.ts")
      if (source === "@openacp/app/index.css") return path.join(appSrc, "index.css")

      // @openacp/util/* → src/util/src/*.ts
      if (source.startsWith("@openacp/util/")) {
        const rest = source.slice("@openacp/util/".length)
        return path.join(utilSrc, rest + ".ts")
      }

      // @openacp/sdk/* → src/sdk/src/*
      if (source.startsWith("@openacp/sdk/")) {
        const rest = source.slice("@openacp/sdk/".length)
        const tsPath = path.join(sdkSrc, rest + ".ts")
        if (fs.existsSync(tsPath)) return tsPath
        const tsxPath = path.join(sdkSrc, rest + ".tsx")
        if (fs.existsSync(tsxPath)) return tsxPath
        const indexPath = path.join(sdkSrc, rest, "index.ts")
        if (fs.existsSync(indexPath)) return indexPath
        return null
      }

      // Stub out ghostty-web (not available)
      if (source === "ghostty-web") {
        return "\0virtual:ghostty-stub"
      }

      return null
    },
    load(id: string) {
      if (id === "\0virtual:ghostty-stub") {
        return `export default {};
export const File = () => null;
export const FileDiff = () => null;
export const VirtualizedFile = () => null;
export const VirtualizedFileDiff = () => null;
export const Terminal = class {};
export const Ghostty = class {};`
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [openacpResolver(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/app"),
    },
  },
  build: {
    rollupOptions: {
      external: [
        "ghostty-web",
      ],
    },
  },
  test: {
    environment: "node",
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
})
