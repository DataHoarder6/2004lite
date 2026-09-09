import { describe, expect, it } from 'vitest';
import { StateDiffer } from '../../host/differ';
import type { HostChatLine, HostClientState } from '../../host/hooks';

function state(overrides: Partial<HostClientState> = {}): HostClientState {
    return {
        ingame: true,
        loopCycle: 10,
        statXP: new Int32Array(25),
        statBaseLevel: new Int32Array(25),
        statEffectiveLevel: new Int32Array(25),
        runEnergy: 100,
        weight: 0,
        mapPosition: null,
        camera: { pitch: 128, yaw: 0 },
        chat: [],
        setCameraPitch: () => false,
        readInventory: () => null,
        ...overrides
    };
}

describe('StateDiffer', () => {
    it('emits nothing on out-of-game snapshots and resets', () => {
        const differ = new StateDiffer();
        differ.snapshot(state());
        differ.snapshot(state({ ingame: false }));
        const events = differ.snapshot(
            state({
                statXP: (() => {
                    const a = new Int32Array(25);
                    a[0] = 100;
                    return a;
                })()
            })
        );
        // reset wiped baseline, so the first real snapshot just re-baselines
        expect(events.filter(e => e.kind === 'xp-gained')).toEqual([]);
    });

    it('emits xp-gained with delta on xp change', () => {
        const differ = new StateDiffer();
        const base = new Int32Array(25);
        base[0] = 100;
        differ.snapshot(state({ statXP: base }));

        const next = base.slice();
        next[0] = 115;
        const events = differ.snapshot(state({ statXP: next }));

        const xp = events.filter(e => e.kind === 'xp-gained');
        expect(xp).toHaveLength(1);
        expect(xp[0]).toMatchObject({ kind: 'xp-gained', delta: 15, skill: { index: 0, name: 'attack' } });
    });

    it('never emits for unused skill slots', () => {
        const differ = new StateDiffer();
        const base = new Int32Array(25);
        differ.snapshot(state({ statXP: base }));

        const next = base.slice();
        next[19] = 500; // -unused-
        const events = differ.snapshot(state({ statXP: next }));
        expect(events.filter(e => e.kind === 'xp-gained')).toEqual([]);
    });

    it('emits stat-changed on effective level change', () => {
        const differ = new StateDiffer();
        differ.snapshot(state());

        const levels = new Int32Array(25);
        levels[3] = 4; // hitpoints raised
        const events = differ.snapshot(state({ statEffectiveLevel: levels }));
        const changed = events.filter(e => e.kind === 'stat-changed');
        expect(changed).toHaveLength(1);
        expect((changed[0] as { skill: { name: string } }).skill.name).toBe('hitpoints');
    });

    it('emits run-energy-changed on change', () => {
        const differ = new StateDiffer();
        differ.snapshot(state());
        const events = differ.snapshot(state({ runEnergy: 75 }));
        expect(events).toContainEqual({ kind: 'run-energy-changed', value: 75 });
    });

    it('emits chat-message for new lines, oldest first', () => {
        const differ = new StateDiffer();
        differ.snapshot(state());

        // index 0 is the newest line ('b'); emission is oldest-first
        const line = (text: string): HostChatLine => ({ type: 0, text, sender: '', cycle: 10 });
        const events = differ.snapshot(state({ chat: [line('b'), line('a')] }));

        const messages = events.filter(e => e.kind === 'chat-message');
        expect(messages.map(m => (m as { message: { text: string } }).message.text)).toEqual(['a', 'b']);
    });

    it('does not re-emit unchanged chat', () => {
        const differ = new StateDiffer();
        const line = (): HostChatLine => ({ type: 0, text: 'hello', sender: '', cycle: 10 });
        differ.snapshot(state({ chat: [line()] }));
        const events = differ.snapshot(state({ chat: [line()] }));
        expect(events.filter(e => e.kind === 'chat-message')).toEqual([]);
    });

    it('maps client chat type codes to facade types', () => {
        const differ = new StateDiffer();
        differ.snapshot(state());
        const events = differ.snapshot(
            state({
                chat: [{ type: 4, text: 'wishes to trade', sender: 'Zezima', cycle: 10 }]
            })
        );
        expect(events.find(e => e.kind === 'chat-message')).toMatchObject({
            message: { type: 'trade-request' }
        });
    });

    it('emits inventory-changed for watched inventories only', () => {
        const differ = new StateDiffer();
        const inv = (ids: number[]): { ids: Int32Array; counts: Int32Array } => ({
            ids: new Int32Array(ids),
            counts: new Int32Array(ids.map(() => 1))
        });

        differ.watchInventory(3214);
        differ.snapshot(state({ readInventory: (comId: number) => (comId === 3214 ? inv([1, 2]) : null) }));
        const events = differ.snapshot(state({ readInventory: (comId: number) => (comId === 3214 ? inv([1, 3]) : null) }));

        const invEvents = events.filter(e => e.kind === 'inventory-changed');
        expect(invEvents).toHaveLength(1);
        const inventory = (invEvents[0] as { inventory: { items: { id: number }[] } }).inventory;
        expect(inventory.items.map(i => i.id)).toEqual([1, 3]);
    });

    it('does not re-emit unchanged inventories', () => {
        const differ = new StateDiffer();
        const inv = (): { ids: Int32Array; counts: Int32Array } => ({
            ids: new Int32Array([5]),
            counts: new Int32Array([10])
        });
        differ.watchInventory(3214);
        differ.snapshot(state({ readInventory: () => inv() }));
        const events = differ.snapshot(state({ readInventory: () => inv() }));
        expect(events.filter(e => e.kind === 'inventory-changed')).toEqual([]);
    });
});
