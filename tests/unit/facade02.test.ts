// Facade 0.2.0: menu decode, attack-rate lookup, combat differ.

import { describe, expect, it } from 'vitest';

import { decodeMenuEntry, decodeTargetKind, decodeTargetName } from '../../host/decode.js';
import { npcAttackRate, weaponAttackRate, isRapidWeapon, type AttackRateTable } from '#api/combat.js';
import { StateDiffer } from '../../host/differ.js';
import type { HostClientState, HostCombatEntity } from '../../host/hooks.js';

const TABLE: AttackRateTable = { contentCommit: 'abc123', defaultRate: 4, npc: { '123': 6 }, weapon: { '456': 5 }, rapid: [841] };

function entity(over: Partial<HostCombatEntity> = {}): HostCombatEntity {
    return {
        key: 'npc:7',
        kind: 'npc',
        slot: 7,
        typeId: 123,
        name: 'Goblin',
        health: 10,
        totalHealth: 10,
        primaryAnim: -1,
        faceEntity: -1,
        combatCycle: -1000,
        x: 3200,
        z: 3200,
        height: 60,
        hitsplats: [],
        ...over
    };
}

function state(entities: HostCombatEntity[], loopCycle = 100): HostClientState {
    return {
        ingame: true,
        loopCycle,
        statXP: new Int32Array(25),
        statBaseLevel: new Int32Array(25),
        statEffectiveLevel: new Int32Array(25),
        runEnergy: 100,
        weight: 0,
        mapPosition: null,
        camera: { pitch: 128, yaw: 0 },
        chat: [],
        entities,
        wornWeaponId: null,
        combatMode: 0,
        setCameraPitch: () => true,
        readInventory: () => null,
        readObjDef: () => null,
        readGroundItems: () => [],
        revealed: [],
        projectTile: () => null,
        projectToScreen: () => null
    };
}

describe('decodeTargetKind', () => {
    it('maps npc/player/loc/obj/held/walk actions, stripping the priority bit', () => {
        expect(decodeTargetKind(242)).toBe('npc');
        expect(decodeTargetKind(2242)).toBe('npc');
        expect(decodeTargetKind(1714)).toBe('npc');
        expect(decodeTargetKind(639)).toBe('player');
        expect(decodeTargetKind(625)).toBe('loc');
        expect(decodeTargetKind(139)).toBe('obj');
        expect(decodeTargetKind(694)).toBe('held');
        expect(decodeTargetKind(718)).toBe('walk');
        expect(decodeTargetKind(1106)).toBe('interface');
    });
});

describe('decodeTargetName', () => {
    it('takes the tail past the option and strips color tags', () => {
        expect(decodeTargetName('@yel@Bank Banker')).toBe('Banker');
        expect(decodeTargetName('Walk here')).toBe('here');
        expect(decodeTargetName('Cancel')).toBe('');
    });
});

describe('decodeMenuEntry', () => {
    it('fills decoded fields alongside raw params', () => {
        const entry = decodeMenuEntry(2, { option: '@yel@Attack Goblin', action: 2209, paramA: 7, paramB: 50, paramC: 60 });
        expect(entry).toMatchObject({ index: 2, targetKind: 'npc', targetName: 'Goblin', isPriority: true, paramA: 7 });
    });
});

describe('attack-rate lookup', () => {
    it('prefers table rates and falls back to the server default', () => {
        expect(npcAttackRate(TABLE, 123)).toBe(6);
        expect(npcAttackRate(TABLE, 999)).toBe(4);
        expect(weaponAttackRate(TABLE, 456)).toBe(5);
        expect(weaponAttackRate(TABLE, 1)).toBe(4);
    });

    it('flags rapid-category weapons from the snapshot', () => {
        expect(isRapidWeapon(TABLE, 841)).toBe(true);
        expect(isRapidWeapon(TABLE, 456)).toBe(false);
    });
});

describe('combat differ', () => {
    it('baselines new entities silently, then emits anim/hitsplat/target events', () => {
        const differ = new StateDiffer();
        expect(differ.snapshot(state([entity()]))).toEqual([]);

        const attacked = entity({ primaryAnim: 422, faceEntity: 2047, hitsplats: [{ type: 0, value: 3, cycle: 150 }] });
        const events = differ.snapshot(state([attacked], 160));
        expect(events.map(e => e.kind).sort()).toEqual(['anim-started', 'hitsplat', 'target-changed']);
        const anim = events.find(e => e.kind === 'anim-started');
        expect(anim).toMatchObject({ animId: 422, loopCycle: 160 });
        const target = events.find(e => e.kind === 'target-changed');
        expect(target).toMatchObject({ targetKey: 'npc:2047' });

        expect(differ.snapshot(state([attacked], 161)).filter(e => e.kind === 'anim-started')).toEqual([]);
    });

    it('drops despawned entities without events and resets off-game', () => {
        const differ = new StateDiffer();
        differ.snapshot(state([entity()]));
        expect(differ.snapshot(state([]))).toEqual([]);
        const off = state([entity({ primaryAnim: 422 })]);
        off.ingame = false;
        expect(differ.snapshot(off)).toEqual([]);
    });
});
