// NPC tracker: engagement reconciliation + anim resync.

import { describe, expect, it } from 'vitest';

import { NpcTracker } from '../../plugins/npc-attacktimer/src/tracker.js';

const GOBLIN = { key: 'npc:7', typeId: 123, name: 'Goblin' };
const RAT = { key: 'npc:8', typeId: 456, name: 'Rat' };

describe('NpcTracker', () => {
    it('tracks engaged NPCs at full period, drops the rest', () => {
        const tracker = new NpcTracker();
        const live = tracker.update([GOBLIN, RAT], new Set(['npc:7']), () => 5);
        expect(live).toMatchObject([{ key: 'npc:7', period: 5, ticksLeft: 5 }]);
        tracker.onTick();
        expect(tracker.all()[0].ticksLeft).toBe(4);
        tracker.update([GOBLIN, RAT], new Set(['npc:8']), () => 5);
        expect(tracker.all().map(t => t.key)).toEqual(['npc:8']);
    });

    it('resyncs on observed anims and floors at zero', () => {
        const tracker = new NpcTracker();
        tracker.update([GOBLIN], new Set(['npc:7']), () => 6);
        tracker.onTick();
        tracker.onTick();
        tracker.onAnim('npc:7');
        expect(tracker.all()[0].ticksLeft).toBe(6);
        for (let i = 0; i < 20; i++) {
            tracker.onTick();
        }
        expect(tracker.all()[0].ticksLeft).toBe(0);
        tracker.onAnim('npc:unknown');
        expect(tracker.all()).toHaveLength(1);
        tracker.clear();
        expect(tracker.all()).toEqual([]);
    });
});
