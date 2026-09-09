# Full menu-swapper parity and both attack timers

Date: 2026-09-09. Supersedes the MVP scoping of these plugins in
[docs/mvp.md](../mvp.md) (the MVP demo milestone still stands; these three
plugins ship at full scope, not demo scope).

## Menu swapper: full RuneLite parity, 2004-relevant subset

Port the complete RuneLite Menu Entry Swapper behavior model — preset swaps
plus per-entry custom left-click and shift-click swaps with persisted rules —
for every interaction that exists in build 274. Modern-only presets (GE,
group storage, CoX, fairy-ring last-destination, jewellery-box dests,
Tempoross/ToA bosses) are dropped: the content doesn't exist here, not
deferred.

Stays inside the swap-only rule (CONTEXT.md, ADR-0005): presets and custom
rules only exchange existing entries. Walk-here deprioritization is also a
swap. New facade needs versus today: decoded entry fields (op index, target
id/name, priority flag), live shift-key state, and persisted custom rules via
the config store. No menu-entry synthesis, no click triggering.

Custom swaps are defined in-game with shift+right-click, like RuneLite: the
host appends host-owned capture entries (host chrome, not plugin facade —
plugins stay swap-only and never see them as swappable entries) and persists
the resulting rules to the config store. Config-panel text rules remain as a
fallback and import/export path. Capture entries are stripped before plugin
swappers run so they can never be swapped or mistaken for game entries.

Shift sampling follows RuneLite: live `isKeyPressed(SHIFT)` read at menu-build
time for all swaps (sampled at the same instant as the entries), plus a
per-tick `lastShift`/`curShift` snapshot for the Walk-here deprioritize path.
Shift is client-only either way — no packet, server-invisible.

## Player attack timer: port ngraves95/attacktimer

Port [ngraves95/attacktimer](https://github.com/ngraves95/attacktimer) (tick
state machine `NOT_ATTACKING`/`DELAYED_FIRST_TICK`/`DELAYED` + holdoff,
number-over-player overlay + cooldown bar, eat delays). Two deliberate
deviations: weapon periods come from the server's `attackrate` obj params
(see below), not RuneLite's `aspeed` equipment stats; the modern-boss
`VariableSpeed` pack is replaced by a `VariableSpeed` interface with only
2004-relevant rules (rapid attack style). Spec/item tracking, sound-based
cast detection, and HD bar sprites are out.

## NPC attack timer: separate plugin, all NPCs

Separate `npc-attacktimer` plugin: ticks until next attack for every engaged
NPC. Client `NpcType` carries no speed fields, so periods come from a
build-time table generated from the Content repo's `attackrate` NPC params
(default 4 ticks where unset). Countdowns synchronize on observed attack
animations (`primaryAnim` starts) and hitsplats; no per-NPC config in v1.

## Attack rates are server data, snapshotted at build time

NPC `attackrate` (`content/scripts/skill_combat/configs/combat.param`,
`all.npc` params) and weapon `attackrate` (melee/ranged obj configs) are
server-authoritative, ticks of 0.6s (`Engine-TS World.TICKRATE`). A generator
script snapshots them into versioned tables shipped with the plugins; the
Content commit hash is recorded alongside so drift is detectable. The client
never guesses speeds from animation lengths.

## Facade 0.2.0

New `api/combat.ts` (NPC/player snapshots, combat events: anim start,
hitsplat, target change) plus decoded `MenuEntry` fields and shift state.
Wire-surface gains apply. Build order: one facade pass, then menu-swapper,
then player attack timer, then NPC attack timer.
