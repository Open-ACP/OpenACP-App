import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"
import fs from "node:fs"

const host = process.env.TAURI_DEV_HOST

// Custom resolver that maps @openacp/* package imports to local copies
function openacpResolver() {
  const appSrc = path.resolve(__dirname, "src/app")
  const utilSrc = path.resolve(__dirname, "src/util/src")
  const sdkSrc = path.resolve(__dirname, "src/openacp-sdk")

  return {
    name: "openacp-resolver",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
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

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [openacpResolver(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/app"),
      "src/lib/utils": path.resolve(__dirname, "src/lib/utils.ts"),
      "src/openacp/components/ui": path.resolve(__dirname, "src/openacp/components/ui"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        "ds-demo": path.resolve(__dirname, "ds-demo.html"),
      },
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
