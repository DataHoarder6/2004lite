// NPC Attack Timer: ticks until each engaged NPC's next attack, anchored
// over heads via worldToScreen (ADR-0011, docs/plugins-spec.md). Periods come
// from the server attackrate snapshot; countdowns sync on observed attack
// animations and hitsplats. No per-NPC config in v1.
//
// Engagement = the NPC targets the local player, or is the local player's
// target (faceEntity encoding, see host/differ.ts faceEntityKey).

import { definePlugin } from '#api/plugin.js';
import type { AnimStartedEvent, HitsplatEvent } from '#api/events.js';
import { npcAttackRate, type AttackRateTable } from '#api/combat.js';
import type { CombatEntity } from '#api/combat.js';
import tableJson from '../../../data/attackrates.json';
import { NpcTracker } from './tracker.js';

const TABLE = tableJson as AttackRateTable;

/** Client faceEntity values below this are npc slots (else player+32768). */
const FACE_NPC_CUTOFF = 32768;
const FACE_PLAYER_BASE = 32768;

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

    ctx.events.on('cycle', () => {
        if (!ctx.client.ingame) {
            tracker.clear();
            return;
        }
        const local = ctx.client.localPlayer();
        if (!local) {
            tracker.clear();
            return;
        }
        const npcs = ctx.client.combatEntities().filter(e => e.kind === 'npc');
        tracker.update(
            npcs.map(n => ({ key: n.key, typeId: n.typeId, name: n.name })),
            engagedKeys(local, npcs),
            typeId => npcAttackRate(TABLE, typeId)
        );
        tracker.onTick();
    });

    ctx.events.on('anim-started', (event: AnimStartedEvent) => {
        if (event.entity.kind === 'npc') {
            tracker.onAnim(event.entity.key);
        }
    });

    // A hitsplat on an engaged NPC also marks it mid-attack: resync in case
    // the opening anim arrived before engagement (or was missed entirely).
    ctx.events.on('hitsplat', (event: HitsplatEvent) => {
        if (event.entity.kind === 'npc') {
            tracker.onAnim(event.entity.key);
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
