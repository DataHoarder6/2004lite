// Ground items: list matching parity + differ lifecycle.

import { describe, expect, it } from 'vitest';
import { StateDiffer } from '../../host/differ';
import type { HostClientState } from '../../host/hooks';
import { formatStack, matchList, parseList } from '../../plugins/ground-items/src/match';

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
        entities: [],
        wornWeaponId: null,
        setCameraPitch: () => false,
        readInventory: () => null,
        readObjDef: () => null,
        readGroundItems: () => [],
        revealed: [],
        projectTile: () => null,
        projectToScreen: () => null,
        ...overrides
    };
}

function stack(id: number, count: number, tileX = 3200, tileZ = 3200) {
    return { level: 0, tileX, tileZ, id, count };
}

describe('parseList/matchList', () => {
    it('matches exact names case-insensitively', () => {
        const rules = parseList('Coins, Shark');
        expect(matchList(rules, 'coins', 1)).toBe(true);
        expect(matchList(rules, 'SHARK', 3)).toBe(true);
        expect(matchList(rules, 'Sword', 1)).toBe(false);
    });

    it('supports wildcards and quantity guards', () => {
        expect(matchList(parseList('Rune*'), 'Rune scimitar', 1)).toBe(true);
        expect(matchList(parseList('Coins>100'), 'Coins', 101)).toBe(true);
        expect(matchList(parseList('Coins>100'), 'Coins', 100)).toBe(false);
        expect(matchList(parseList('Shark<5'), 'Shark', 4)).toBe(true);
        expect(matchList(parseList('Shark<5'), 'Shark', 5)).toBe(false);
    });

    it('ignores blanks', () => {
        expect(parseList('  , ,')).toEqual([]);
        expect(matchList(parseList(''), 'Coins', 1)).toBe(false);
    });
});

describe('formatStack', () => {
    it('formats small, K and M ranges', () => {
        expect(formatStack(999)).toBe('999');
        expect(formatStack(12345)).toBe('12.3K');
        expect(formatStack(20000000)).toBe('20M');
        expect(formatStack(12345678)).toBe('12.3M');
    });
});

describe('differ ground items', () => {
    it('emits spawned with derived alch values', () => {
        const differ = new StateDiffer();
        differ.snapshot(state());
        const events = differ.snapshot(
            state({
                loopCycle: 11,
                readObjDef: () => ({ name: 'Rune scimitar', cost: 25600 }),
                readGroundItems: () => [stack(1, 1)]
            })
        );
        const spawned = events.filter(e => e.kind === 'ground-item-spawned');
        expect(spawned).toHaveLength(1);
        expect(spawned[0]).toMatchObject({
            kind: 'ground-item-spawned',
            item: { id: 1, name: 'Rune scimitar', qty: 1, highAlch: 15360, lowAlch: 10240, firstSeenCycle: 11 }
        });
    });

    it('emits quantity on merge and resets first-seen, despawned on pickup', () => {
        const differ = new StateDiffer();
        const def = () => ({ name: 'Coins', cost: 1 });
        differ.snapshot(state({ readObjDef: def, readGroundItems: () => [stack(2, 10)] }));
        const merged = differ.snapshot(state({ loopCycle: 12, readObjDef: def, readGroundItems: () => [stack(2, 25)] }));
        const qty = merged.filter(e => e.kind === 'ground-item-quantity');
        expect(qty).toHaveLength(1);
        expect(qty[0]).toMatchObject({ item: { qty: 25, firstSeenCycle: 12 }, previousQty: 10 });

        const gone = differ.snapshot(state({ loopCycle: 13, readObjDef: def, readGroundItems: () => [] }));
        expect(gone.filter(e => e.kind === 'ground-item-despawned')).toHaveLength(1);
    });
});
