import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

const host = process.env.TAURI_DEV_HOST

// Custom resolver that maps @openacp/* package imports to local copies
function openacpResolver() {
  const utilSrc = path.resolve(__dirname, "src/util/src")

  return {
    name: "openacp-resolver",
    enforce: "pre" as const,
    resolveId(source: string, _importer: string | undefined) {
      // @openacp/util/* → src/util/src/*.ts
      if (source.startsWith("@openacp/util/")) {
        const rest = source.slice("@openacp/util/".length)
        return path.join(utilSrc, rest + ".ts")
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
      "@": path.resolve(__dirname, "src/openacp"),
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
