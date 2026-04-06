.PHONY: dev build tauri-dev tauri-build install clean release release-dry lint

# ── Development ──

install:
	pnpm install

dev:
	pnpm dev

tauri-dev:
	pnpm tauri dev

# ── Build ──

build:
	pnpm build

tauri-build:
	pnpm tauri build

# ── Release ──

release:
	./scripts/release.sh

release-dry:
	./scripts/release.sh --dry

# ── Maintenance ──

clean:
	rm -rf dist node_modules/.vite
	cd src-tauri && cargo clean

lint:
	pnpm tsc --noEmit
