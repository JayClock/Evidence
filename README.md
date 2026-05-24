# Evidence

Nx monorepo workspace with:

- `@evidence/web` — the single React + Vite UI (`apps/web`)
- `@evidence/server` — Rust Axum backend server (`apps/server`)
- `@evidence/desktop` — Tauri 2 desktop shell (`apps/desktop`) that loads/builds `@evidence/web`

## Prerequisites

- Node.js 22+
- pnpm 10+
- Rust toolchain (`cargo`, `rustc`)
- Tauri system dependencies for your OS: <https://tauri.app/start/prerequisites/>

## Install

```sh
pnpm install
```

## Common commands

```sh
# List projects
pnpm nx show projects

# Shared React UI for browser and desktop
pnpm dev:web
pnpm nx build @evidence/web
pnpm nx test @evidence/web --run

# Rust server
pnpm dev:server
curl http://127.0.0.1:3000/health
pnpm nx build @evidence/server
pnpm nx test @evidence/server

# Desktop shell; Tauri loads apps/web in dev and bundles apps/web/dist in build
pnpm dev:desktop
pnpm nx run @evidence/desktop:build
# Full platform bundles, e.g. DMG on macOS:
# pnpm --dir apps/desktop tauri build --bundles dmg
```

## Desktop/Web relationship

`apps/desktop/src-tauri/tauri.conf.json` is configured as follows:

- dev: starts `@evidence/web` on `http://127.0.0.1:4200` and opens it in Tauri
- build: runs `pnpm nx build @evidence/web`
- bundle: uses `apps/web/dist` as Tauri `frontendDist`

So `apps/web` is now the only frontend source; desktop no longer has a separate React app.

## Workspace layout

```text
apps/
  server/              Rust backend server
  desktop/             Tauri desktop shell
    src-tauri/         Tauri Rust crate and config
  web/                 Shared React frontend app
Cargo.toml             Rust workspace
nx.json                Nx workspace config
pnpm-workspace.yaml    pnpm workspace config
```
