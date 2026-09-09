# MVP Definition

Last verified: 2026-09-09

Done = the demo below works on a machine with the standard LostCity Server
repo, plus green CI. Nothing else is in scope.

## Demo

1. `bun run host:install` — builds the fork and copies `out/*` plus
   `plugins/index.json` + built plugins into `$ENGINE_DIR/public/`.
2. Play at `http://localhost/rs2.cgi` — authentic client, no page/engine
   changes.
3. Three plugins work:
    - **XP Tracker** — exercises events + overlay + persistence
    - **Inventory Value** — exercises config + cache data + overlay
    - **Camera Zoom** — exercises benign client-local write
4. CI: Playwright journey suite green against a programmatically booted
   Engine-TS (sqlite singleworld, checked-in world.json, seeded test account).

## Build order (tracer bullet)

1. Fork imports upstream history (branch 274). Instrumentation hook in
   `gameLoop`/`mainredraw`.
2. Host boot + hello-world overlay via sideload.
3. Event bus.
4. Config panel.
5. Typed action API (integration tests assert exact bytes).
6. The three plugins.

The test bar (ADR-0006) applies from step 1, not bolted on at the end.

## Out of scope until MVP ships

- Plugin Hub (installer, updater, review machinery)
- Synthetic input (deferred facade addition, per ADR-0005)
- Multi-version client support (facade targets 274 only, per ADR-0002)
- DOM side-panel beyond the settings panel
- True plugin unload (disable only, per Q13 decision)
