# 2004lite

Fork of LostCityRS/Client-TS (build 274) with a RuneLite-style plugin host:
stable facade API, event bus, config, canvas overlays. Players keep the
authentic 2004 client and gain third-party plugins.

Read [CONTEXT.md](./CONTEXT.md) for domain language before anything else.

## Hard rules

- Never import raw client internals (`#/client`, `#/dash3d`, ...) from facade,
  host, or plugin code — only the facade package.
- Upstream files (`src/**`, `bundle.ts`, `package.json` from the 274 import)
  change only for instrumentation: small, `//2004lite`-marked edits. No
  refactors, no renames inside upstream files.
- Plugins are trusted in-process code but never allowed to crash the host
  (ADR-0007): every plugin callback is wrapped by instrumentation.
- No raw-packet or raw-input API on the facade (ADR-0005).

## Commands

| Command                      | Purpose                                                      |
| ---------------------------- | ------------------------------------------------------------ |
| `bun run build`              | Build client bundle to `out/` (upstream script)              |
| `bun run host:install`       | Build + copy `out/*` and plugins into `$ENGINE_DIR/public/`  |
| `bun run sideload add <dir>` | Copy built plugin into `$ENGINE_DIR/public/plugins/` + index |
| `bun run test`               | Unit + integration (vitest; integration in browser mode)     |
| `bun run test:e2e`           | Playwright journeys against booted Engine-TS                 |
| `bun run lint`               | ESLint (upstream config, extended for api/host/plugins)      |

`ENGINE_DIR` defaults to `../Server`-style sibling; set in `.env`.

## Map of docs

- [CONTEXT.md](./CONTEXT.md) — glossary, the only place terms are defined
- [docs/mvp.md](./docs/mvp.md) — MVP definition, build order, out-of-scope list
- [docs/adr/](./docs/adr/) — decision records

## Repo layout (target)

- `src/` — upstream Client-TS 274, only marked instrumentation edits
- `api/` — facade (versioned surface plugins code against)
- `host/` — plugin runtime (loader, bus, config, overlays)
- `plugins/` — MVP plugin sources (built to `$ENGINE_DIR/public/plugins/`)

## Gotchas

- Engine's `?plugin=1` query on `/rs2.cgi` is upstream's Java-applet toggle;
  unrelated to our plugins.
- The page imports `./client/client.js` and calls `new Client(...)` directly —
  host must bootstrap inside the bundle, not the page.
- Events flush after each game cycle, never mid-tick (ADR-0006, Q13 decision).
