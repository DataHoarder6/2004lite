// Attack Timer: ngraves95/attacktimer port (ADR-0011, docs/plugins-spec.md).
// Tick number over the local player's head + cooldown bar, driven by the
// server attackrate snapshot (data/attackrates.json): worn-weapon rate via
// ClientState.wornWeaponId, rapid style read from the client (%com_mode varp
// + rapid snapshot, never user-specified), normal-food eats +3 hardcoded
// (Content consume.rs2). Countdown advances on facade `tick` (server ticks,
// 600ms) — never `cycle` (~50Hz client frames).
//
// Engagement is damage-gated: facing alone never starts the clock (talking,
// pickpocketing and emoting at NPCs stay silent). The first observed damage
// primes it; subsequent local swings resync the exact phase. v1 limit: any
// local anim while active resyncs (no attack-anim allowlist yet), so emoting
// mid-fight restarts the countdown early.

import { definePlugin } from '#api/plugin.js';
import { INVENTORY_COMID } from '#api/types.js';
import type { AnimStartedEvent, HitsplatEvent, InventoryChangedEvent, TickEvent } from '#api/events.js';
import { FACE_PLAYER_BASE, RAPID_STYLE_INDEX, allowsResync, isRapidWeapon, weaponAttackRate, type AttackRateTable } from '#api/combat.js';
import tableJson from '../../../data/attackrates.json';
import { AttackClock, RapidRule } from './clock.js';

const TABLE = tableJson as AttackRateTable;

/**
 * Ticks the server adds to a pending attack when eating normal food
 * (Content consume.rs2: skill_delay 3). Hardcoded server truth, not a
 * setting. v1 limit: potions/gnome foods also trigger the consumption
 * heuristic although the server adds no delay for them.
 */
const EAT_DELAY_TICKS = 3;

/** Ticks without a swing or damage before an active clock stands down. */
const IDLE_STAND_DOWN_TICKS = 8;

/** Catch-up cap per tick event (background-tab frame gaps). */
const MAX_CATCH_UP = 10;

const BAR_W = 36;
const BAR_H = 4;
// Fixed-mode viewport: overlay pixels outside it smear over static UI
// (same class of bug as ground-items text; see its VIEW_* comment).
const VIEW_X = 4;
const VIEW_Y = 4;
const VIEW_W = 512;
const VIEW_H = 334;

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            { key: 'show-number', label: 'Show tick number over player', type: 'boolean', default: true },
            { key: 'show-bar', label: 'Show cooldown bar', type: 'boolean', default: true },
            {
                key: 'period-override',
                label: 'Force weapon period (0 = auto)',
                type: 'number',
                default: 0,
                min: 0,
                max: 10,
                description: '0 reads the worn weapon from the snapshot; set for magic (5) or unknown weapons.'
            },
            { key: 'zero-based', label: 'Zero-based counting', type: 'boolean', default: false }
        ]
    });

    const clock = new AttackClock();
    let lastPeriod = TABLE.defaultRate;
    let lastTick = -1;
    let lastActionTick = -1;
    let lastTakenTick = -1;
    let suppressTick = -1;
    let lastInv = new Map<number, { id: number; count: number }>();

    function resolvePeriod(): number {
        const override = config.get<number>('period-override');
        if (override > 0) {
            return override;
        }
        const worn = ctx.client.wornWeaponId();
        if (worn === null) {
            return TABLE.defaultRate;
        }
        // Rapid is read from the client (%com_mode varp) + snapshot, never
        // user-specified: style index 1 on a bow/crossbow/thrown attacks a
        // tick faster (Content player_ranged.rs2).
        const rapid = ctx.client.combatMode() === RAPID_STYLE_INDEX && isRapidWeapon(TABLE, worn);
        return new RapidRule(rapid).adjust(weaponAttackRate(TABLE, worn));
    }

    ctx.events.on('tick', (event: TickEvent) => {
        if (!ctx.client.ingame) {
            clock.onReset();
            lastInv.clear();
            lastTick = event.tick;
            return;
        }
        if (lastTick === -1) {
            lastTick = event.tick;
        }
        let catchUp = Math.min(event.tick - lastTick, MAX_CATCH_UP);
        lastTick = event.tick;
        lastPeriod = resolvePeriod();
        clock.setPeriod(lastPeriod);
        while (catchUp-- > 0) {
            clock.onTick();
        }
        const local = ctx.client.localPlayer();
        const face = local?.faceEntity ?? -1;
        // Kiting/running clears our facing, but the fight is alive while an
        // NPC still targets us — stand down only when nothing does and no
        // swing or damage has landed for a while.
        const targeted = local !== null && ctx.client.combatEntities().some(e => e.kind === 'npc' && e.faceEntity === FACE_PLAYER_BASE + local.slot);
        if (clock.current !== 'NOT_ATTACKING' && face === -1 && !targeted && event.tick - lastActionTick > IDLE_STAND_DOWN_TICKS) {
            clock.onDisengage();
        }
    });

    ctx.events.on('anim-started', (event: AnimStartedEvent) => {
        const local = ctx.client.localPlayer();
        if (!local || event.entity.key !== local.key || local.faceEntity === -1) {
            return;
        }
        // Eat anim lands the same server tick as its inventory consumption:
        // the consumption handler already added the delay, don't resync.
        if (lastTick === suppressTick) {
            return;
        }
        lastActionTick = lastTick;
        // Same-tick incoming damage means this is a defend flinch, not a
        // swing (allowsResync): stay engaged, skip the resync.
        if (clock.current !== 'NOT_ATTACKING' && allowsResync(lastTick, lastTakenTick)) {
            clock.onAttackAnim();
        }
    });

    ctx.events.on('hitsplat', (event: HitsplatEvent) => {
        const local = ctx.client.localPlayer();
        if (!local || local.faceEntity === -1) {
            return;
        }
        if (event.entity.key === local.key) {
            lastTakenTick = lastTick;
        }
        const myTarget = local.faceEntity < 32768 ? `npc:${local.faceEntity}` : null;
        const hitMyTarget = myTarget !== null && event.entity.key === myTarget;
        const hitMe = event.entity.key === local.key;
        if (!hitMe && !hitMyTarget) {
            return;
        }
        // First observed damage primes the clock; the next swing syncs the
        // exact phase (damage lands ~1 tick after the swing that caused it).
        lastActionTick = lastTick;
        if (clock.current === 'NOT_ATTACKING') {
            clock.onEngage();
        }
    });

    ctx.events.on('inventory-changed', (event: InventoryChangedEvent) => {
        if (event.inventory.comId !== INVENTORY_COMID) {
            return;
        }
        let consumed = false;
        const next = new Map<number, { id: number; count: number }>();
        for (const item of event.inventory.items) {
            next.set(item.slot, { id: item.id, count: item.count });
            const prev = lastInv.get(item.slot);
            if (prev && prev.id > 0 && prev.id === item.id && item.count < prev.count) {
                consumed = true;
            }
            if (prev && prev.id > 0 && item.id === 0 && prev.count > 0) {
                consumed = true;
            }
        }
        lastInv = next;
        if (consumed) {
            suppressTick = lastTick;
            clock.onEat(EAT_DELAY_TICKS);
        }
    });

    ctx.setOverlay({
        render({ ctx: g }) {
            if (clock.current === 'NOT_ATTACKING') {
                return;
            }
            const showNumber = config.get<boolean>('show-number');
            const showBar = config.get<boolean>('show-bar');
            if (!showNumber && !showBar) {
                return;
            }
            const local = ctx.client.localPlayer();
            if (!local) {
                return;
            }
            const point = ctx.client.worldToScreen(local.x, local.z, local.height + 20);
            if (!point) {
                return;
            }
            const ticks = clock.ticksLeft;
            const zeroBased = config.get<boolean>('zero-based');
            const display = zeroBased ? Math.max(ticks - 1, 0) : ticks;
            const ready = ticks <= 0;
            g.save();
            g.beginPath();
            g.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
            g.clip();
            g.textAlign = 'center';
            if (showNumber) {
                g.font = 'bold 12px Arial';
                g.lineWidth = 3;
                g.strokeStyle = '#000000';
                g.strokeText(String(display), point.x, point.y);
                g.fillStyle = ready ? '#00ff00' : '#ffffff';
                g.fillText(String(display), point.x, point.y);
            }
            if (showBar) {
                const fraction = Math.min(Math.max((lastPeriod - ticks) / lastPeriod, 0), 1);
                g.fillStyle = 'rgba(0,0,0,0.6)';
                g.fillRect(point.x - BAR_W / 2, point.y + 4, BAR_W, BAR_H);
                g.fillStyle = ready ? '#00ff00' : '#ffff00';
                g.fillRect(point.x - BAR_W / 2, point.y + 4, BAR_W * fraction, BAR_H);
            }
            g.restore();
        }
    });

    ctx.log('attack-timer started');
});
