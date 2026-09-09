# Implementation spec: full menu swapper + attack timer + NPC attack timer

Decisions: [ADR-0013](./adr/0013-full-swapper-and-attack-timers.md). Terms:
[CONTEXT.md](../CONTEXT.md) (Attack Rate, Attack Timer, NPC Attack Timer).

## 1. Data pipeline: `attackrate` snapshot

- Generator `scripts/regen-attackrates.ts` parses Content repo configs
  (`skill_combat/configs/combat.param` default, `all.npc` params, weapon
  `*.obj` params) into `data/attackrates.json`:
  `{ contentCommit, defaultRate: 4, npc: { [npcId]: rate }, weapon: { [objId]: rate } }`.
- Content path resolves via `$CONTENT_DIR` (default `../content` sibling, same
  pattern as `$ENGINE_DIR`).
- CI check fails on hash drift (regen output differs from checked-in file).
- Both timer plugins read the snapshot; no hardcoded speeds anywhere else.

## 2. Facade 0.2.0 (`api/`)

- `api/combat.ts` (new):
    - `CombatEntity { kind: 'npc' | 'player', slot, typeId, name, health,
totalHealth, primaryAnim, faceEntity, combatCycle }` snapshots for local
      player + visible NPCs/players.
    - Events: `anim-started { entity, animId, loopCycle }`,
      `hitsplat { entity, type, value, loopCycle }`,
      `target-changed { entity, target }`.
    - `worldToScreen(tileX, tileZ, height): { x, y } | null` projector.
    - `attackRate(entity): number` — snapshot-table lookup, default 4.
- `MenuEntry` gains decoded fields: `targetKind` (npc/player/loc/obj/held/
  walk/interface), `targetName`, `isPriority`; `MenuSwapView` gains
  `isShiftDown` (live sample), stays swap-only, and is live (swap() reorders
  the view so sequential swaps stay consistent); Cancel excluded from
  `entries` (fix Spec-review leak).
- `FACADE_VERSION` → `0.2.0`; wire-surface gains for all new props.

## 3. Instrumentation (`src/client/Client.ts`, marked `//2004lite`)

- `emitMinimenu` tail (`:2599-2629`): build decoded entries, sample
  `isShiftDown` live, run plugin swappers, then append host capture entries
  (shift+R-click only). The swapper view skips capture rows by prefix, so
  plugins can never swap or mistake them for game entries.
- Shift sampling is the live `keyHeld` read at menu-build time for all swaps
  (sampled at the same instant as the entries). No separate per-tick
  snapshot: the menu rebuilds every render frame while closed, so the live
  sample already covers the Walk-here deprioritize path.
- Cycle-end (`:2447-2449`): entity snapshots (anim/faceEntity/combatCycle,
  health from `:4694-4731` render state), diff → combat events, flush
  post-cycle per ADR-0006.
- Expose projector (`getOverlayPosEntity` + `projectX/Y`, `:374-375`) via
  `worldToScreen`; keyboard shift read at menu-build site.
- Event-handler failures route to `registry.fail()` (close ADR-0007 gap from
  review).

## 4. Plugins (`plugins/`)

- `menu-swapper`: 2004-relevant presets (NPC Bank/Trade/Travel/Pay/Assignment,
  object quick-pass, item bury/use, bank deposit/withdraw shift-click,
  stairs climb modes) + in-game shift+R-click custom left/shift-click capture
  persisted to config + text-rule fallback/import-export.
- `attack-timer` (new): ngraves95 state machine
  (`NOT_ATTACKING`/`DELAYED_FIRST_TICK`/`DELAYED` + holdoff), tick number over
  player head + cooldown bar, server-`attackrate` periods, rapid-style rule
  via `VariableSpeed` interface, eat delays.
- `npc-attacktimer` (new): per-engaged-NPC countdown from its `attackrate`,
  synced on observed `anim-started`/hitsplat, anchored over heads via
  `worldToScreen`. No per-NPC config v1.

## 5. Tests (ADR-0006, from step 1)

- Unit: attack state machine, swap-rule table, snapshot-hash drift check.
- Browser integration: swap reorders real menu, overlays draw, projector
  tracks entities.
- Playwright e2e vs booted Engine-TS: attack a chicken, assert player
  countdown matches weapon `attackrate` and NPC countdown matches its table
  rate. Acceptance gate for both timers.

## 6. Build order

Facade pass (combat + menu decode + shift + projector) → data pipeline →
menu-swapper → attack-timer → npc-attacktimer, each with its tests green
before the next starts.
