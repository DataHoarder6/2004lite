// NPC Attack Timer: ticks until each engaged NPC's next attack, anchored
// over heads via worldToScreen (ADR-0011, docs/plugins-spec.md). Periods come
// from the server attackrate snapshot. Tracking is damage-gated (see
// tracker.ts): talking/pickpocketing NPCs never shows numbers. Countdowns
// advance on facade `tick` (server ticks), resync on observed attack anims.
// No per-NPC config in v1.
//
// Engagement = the NPC targets the local player, or is the local player's
// target (faceEntity encoding, see host/differ.ts faceEntityKey).

import { definePlugin } from '#api/plugin.js';
import type { AnimStartedEvent, HitsplatEvent, TickEvent } from '#api/events.js';
import { npcAttackRate, type AttackRateTable } from '#api/combat.js';
import type { CombatEntity } from '#api/combat.js';
import tableJson from '../../../data/attackrates.json';
import { NpcTracker } from './tracker.js';

const TABLE = tableJson as AttackRateTable;

/** Client faceEntity values below this are npc slots (else player+32768). */
const FACE_NPC_CUTOFF = 32768;
const FACE_PLAYER_BASE = 32768;

/** Catch-up cap per tick event (background-tab frame gaps). */
const MAX_CATCH_UP = 10;

// Fixed-mode viewport: keep head-anchored numbers inside the repainted scene.
const VIEW_X = 4;
const VIEW_Y = 4;
const VIEW_W = 512;
const VIEW_H = 334;

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [{ key: 'show-number', label: 'Show ticks over engaged NPCs', type: 'boolean', default: true }]
    });

    const tracker = new NpcTracker();
    let lastTick = -1;
    let engagedNow = new Set<string>();

    const periodOf = (typeId: number): number => npcAttackRate(TABLE, typeId);

    function engagedKeys(local: CombatEntity, npcs: CombatEntity[]): Set<string> {
        const keys = new Set<string>();
        const myTargetNpc = local.faceEntity >= 0 && local.faceEntity < FACE_NPC_CUTOFF ? local.faceEntity : -1;
        for (const npc of npcs) {
            if (npc.faceEntity === FACE_PLAYER_BASE + local.slot || npc.slot === myTargetNpc) {
                keys.add(npc.key);
            }
        }
        return keys;
    }

    ctx.events.on('tick', (event: TickEvent) => {
        if (!ctx.client.ingame) {
            tracker.clear();
            engagedNow = new Set();
            lastTick = event.tick;
            return;
        }
        if (lastTick === -1) {
            lastTick = event.tick;
        }
        let catchUp = Math.min(event.tick - lastTick, MAX_CATCH_UP);
        lastTick = event.tick;
        const local = ctx.client.localPlayer();
        if (!local) {
            tracker.clear();
            engagedNow = new Set();
            return;
        }
        const npcs = ctx.client.combatEntities().filter(e => e.kind === 'npc');
        engagedNow = engagedKeys(local, npcs);
        tracker.update(engagedNow, event.tick);
        while (catchUp-- > 0) {
            tracker.onTick();
        }
    });

    ctx.events.on('anim-started', (event: AnimStartedEvent) => {
        if (event.entity.kind === 'npc') {
            tracker.onAnim(event.entity.key);
        }
    });

    ctx.events.on('hitsplat', (event: HitsplatEvent) => {
        if (event.entity.kind === 'npc') {
            // I (or someone) damaged an engaged NPC: combat evidence.
            const sight = { key: event.entity.key, typeId: event.entity.typeId, name: event.entity.name };
            tracker.noteEvidence(sight, engagedNow, periodOf, lastTick);
            return;
        }
        // I took a hit: every NPC facing me is a live attacker.
        const local = ctx.client.localPlayer();
        if (!local) {
            return;
        }
        for (const entity of ctx.client.combatEntities()) {
            if (entity.kind === 'npc' && entity.faceEntity === FACE_PLAYER_BASE + local.slot) {
                tracker.noteEvidence({ key: entity.key, typeId: entity.typeId, name: entity.name }, engagedNow, periodOf, lastTick);
            }
        }
    });

    ctx.setOverlay({
        render({ ctx: g }) {
            if (!config.get<boolean>('show-number')) {
                return;
            }
            const tracked = tracker.all();
            if (tracked.length === 0) {
                return;
            }
            const byKey = new Map(ctx.client.combatEntities().map(e => [e.key, e]));
            g.save();
            g.font = 'bold 12px Arial';
            g.textAlign = 'center';
            g.beginPath();
            g.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
            g.clip();
            for (const npc of tracked) {
                const entity = byKey.get(npc.key);
                if (!entity) {
                    continue;
                }
                const point = ctx.client.worldToScreen(entity.x, entity.z, entity.height + 8);
                if (!point) {
                    continue;
                }
                const imminent = npc.ticksLeft <= 1;
                g.lineWidth = 3;
                g.strokeStyle = '#000000';
                g.strokeText(String(npc.ticksLeft), point.x, point.y);
                g.fillStyle = imminent ? '#ff4444' : '#ffffff';
                g.fillText(String(npc.ticksLeft), point.x, point.y);
            }
            g.restore();
        }
    });

    ctx.log('npc-attacktimer started');
});
