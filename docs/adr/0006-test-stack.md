# Vitest unit + browser-mode integration, Playwright e2e

No test infrastructure exists upstream; we own all of it. Vitest covers unit
(pure logic: bus, config, manifest, plugin math) and integration (facade
against a real Client in real Chromium via vitest browser mode — real canvas,
no jsdom stubs). Playwright runs full e2e journeys only.

E2E boots Engine-TS programmatically (sqlite singleworld, checked-in
world.json, test account seeded via prisma before the browser launches).
Standing worlds and protocol mocks are rejected: shared state and a write path
the server never validates.

Pre-commit runs unit+integration fast path; CI runs everything including e2e.
