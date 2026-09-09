# Read-only packet observer (exception to ADR-0005)

Date: 2026-09-10. Amends [ADR-0005](./0005-typed-action-api.md), which bans a
raw-packet API on the facade.

## Decision

A parsed, read-only observer for upstream/downstream packets (CONTEXT.md)
is allowed: opcode names from the existing `ServerProt`/`ClientProt` enums,
bulk movement packets summarized by default (opcode + size + entity count,
full bitfield decode behind a toggle), category checkboxes all-ON by default
plus an opcode-name text filter, browser console + in-memory ring buffer with
JSON export, output capped (default ~50 lines/sec with drop counter).

## The line (reviewers: verify these on every observer change)

- Observe, parse, log. Never send, synthesize, delay, or drop packets.
- No gameplay logic may gate on observed packets (timers, swaps and overlays
  keep using facade events/state, never the tap).
- The tap lives behind a disabled-by-default debug plugin, not core host
  surface every plugin gets for free.

## Why not host-only (rejected)

A dev-only host flag would avoid the facade question, but the request is a
shippable toggle plugin with panel filters — host-only can't carry per-user
filter config. The exception is narrow enough to hold: read-only is
verifiable in review (grep for `out.` writes in observer code = fail).

## Consequences

- Facade gains a packet-observe bus (new file, not mixed into events.ts:
  ~150 opcodes don't belong in the game-event union).
- Instrumentation grows two marked taps (packet dispatch in, `out` flush
  out). Both are read-only copies.
