// NPC tracker: damage-gated engagement + anim resync + relation drops.

import { describe, expect, it } from 'vitest';

import { NpcTracker } from '../../plugins/npc-attacktimer/src/tracker.js';

const GOBLIN = { key: 'npc:7', typeId: 123, name: 'Goblin' };
const RAT = { key: 'npc:8', typeId: 456, name: 'Rat' };
const ENGAGED = new Set(['npc:7', 'npc:8']);

describe('NpcTracker', () => {
    it('ignores evidence for unengaged NPCs (talking/pickpocket stay silent)', () => {
        const tracker = new NpcTracker();
        expect(tracker.noteEvidence(GOBLIN, new Set(), () => 5)).toBeNull();
        expect(tracker.all()).toEqual([]);
    });

    it('adds engaged NPCs at full period on evidence, resyncs on anims', () => {
        const tracker = new NpcTracker();
        const added = tracker.noteEvidence(GOBLIN, ENGAGED, () => 5);
        expect(added).toMatchObject({ key: 'npc:7', period: 5, ticksLeft: 5 });
        tracker.onTick();
        tracker.onTick();
        expect(tracker.all()[0].ticksLeft).toBe(3);
        tracker.onAnim('npc:7');
        expect(tracker.all()[0].ticksLeft).toBe(5);
        tracker.onAnim('npc:unknown');
        expect(tracker.all()).toHaveLength(1);
    });

    it('persists while the relation holds, drops when it breaks', () => {
        const tracker = new NpcTracker();
        tracker.noteEvidence(GOBLIN, ENGAGED, () => 6);
        tracker.noteEvidence(RAT, ENGAGED, () => 6);
        for (let i = 0; i < 50; i++) {
            tracker.onTick();
        }
        tracker.update(ENGAGED);
        expect(tracker.all().map(t => t.key).sort()).toEqual(['npc:7', 'npc:8']);
        expect(tracker.all()[0].ticksLeft).toBe(0);
        tracker.update(new Set(['npc:8']));
        expect(tracker.all().map(t => t.key)).toEqual(['npc:8']);
    });

    it('clears', () => {
        const tracker = new NpcTracker();
        tracker.noteEvidence(GOBLIN, ENGAGED, () => 6);
        tracker.clear();
        expect(tracker.all()).toEqual([]);
    });
});
