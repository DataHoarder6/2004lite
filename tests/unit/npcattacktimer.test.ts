// NPC tracker: damage-gated engagement + anim resync + stale expiry.

import { describe, expect, it } from 'vitest';

import { NpcTracker, STALE_EVIDENCE_TICKS } from '../../plugins/npc-attacktimer/src/tracker.js';

const GOBLIN = { key: 'npc:7', typeId: 123, name: 'Goblin' };
const RAT = { key: 'npc:8', typeId: 456, name: 'Rat' };
const ENGAGED = new Set(['npc:7', 'npc:8']);

describe('NpcTracker', () => {
    it('ignores evidence for unengaged NPCs (talking/pickpocket stay silent)', () => {
        const tracker = new NpcTracker();
        expect(tracker.noteEvidence(GOBLIN, new Set(), () => 5, 100)).toBeNull();
        expect(tracker.all()).toEqual([]);
    });

    it('adds engaged NPCs at full period on evidence, resyncs on anims', () => {
        const tracker = new NpcTracker();
        const added = tracker.noteEvidence(GOBLIN, ENGAGED, () => 5, 100);
        expect(added).toMatchObject({ key: 'npc:7', period: 5, ticksLeft: 5 });
        tracker.onTick();
        tracker.onTick();
        expect(tracker.all()[0].ticksLeft).toBe(3);
        tracker.onAnim('npc:7');
        expect(tracker.all()[0].ticksLeft).toBe(5);
        tracker.onAnim('npc:unknown');
        expect(tracker.all()).toHaveLength(1);
    });

    it('drops disengaged entries and expires combat-silent ones', () => {
        const tracker = new NpcTracker();
        tracker.noteEvidence(GOBLIN, ENGAGED, () => 6, 100);
        tracker.noteEvidence(RAT, ENGAGED, () => 6, 100);
        tracker.update(new Set(['npc:8']), 100);
        expect(tracker.all().map(t => t.key)).toEqual(['npc:8']);
        tracker.update(new Set(['npc:8']), 100 + STALE_EVIDENCE_TICKS + 1);
        expect(tracker.all()).toEqual([]);
    });

    it('floors countdowns at zero and clears', () => {
        const tracker = new NpcTracker();
        tracker.noteEvidence(GOBLIN, ENGAGED, () => 6, 100);
        for (let i = 0; i < 20; i++) {
            tracker.onTick();
        }
        expect(tracker.all()[0].ticksLeft).toBe(0);
        tracker.clear();
        expect(tracker.all()).toEqual([]);
    });
});
