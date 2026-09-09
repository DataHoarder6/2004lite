// Menu-swapper engine: presets, custom rules, shift gating.

import { describe, expect, it } from 'vitest';

import type { MenuEntry, MenuSwapView } from '#api/plugin.js';
import { decodeMenuEntry } from '../../host/decode.js';
import { applySwaps, type SwapperSettings } from '../../plugins/menu-swapper/src/rules.js';

interface Raw {
    option: string;
    action: number;
}

/** NPC Attack=242, Talk-to=209(op2)? Bank=309(op3)? — any distinct npc ids do. */
const NPC_TALK = 242;
const NPC_BANK = 209;
const NPC_ATTACK = 309;
const WALK = 718;
const HELD_USE = 694;
const HELD_DROP = 962;
const HELD_EAT = 795;
const IF_BUTTON = 231;

function view(options: Raw[], isShiftDown = false): MenuSwapView {
    const list: MenuEntry[] = options.map((o, n) => decodeMenuEntry(n + 1, { ...o, paramA: 0, paramB: 0, paramC: 0 }));
    return {
        entries: list,
        isShiftDown,
        swap: (i: number, j: number): boolean => {
            if (i === j || i <= 0 || j <= 0 || i > list.length || j > list.length) {
                return false;
            }
            const a = list.findIndex(e => e.index === i);
            const b = list.findIndex(e => e.index === j);
            if (a === -1 || b === -1) {
                return false;
            }
            [list[a], list[b]] = [list[b], list[a]];
            list[a].index = i;
            list[b].index = j;
            return true;
        }
    };
}

function top(view: MenuSwapView): string {
    return view.entries.reduce((a, b) => (a.index > b.index ? a : b)).option;
}

function settings(over: Record<string, boolean | number | string> = {}, rules = ''): SwapperSettings {
    const defaults: Record<string, boolean | number | string> = {
        'npc-bank': true,
        'npc-trade': true,
        'npc-travel': true,
        'npc-attack': false,
        'loc-bank': true,
        'loc-open': true,
        'stairs-mode': 'off',
        'item-eat': true,
        'item-bury': true,
        'bank-shift': true,
        'walk-deprioritize': true
    };
    return { get: key => over[key] ?? defaults[key]!, getRulesText: () => rules };
}

const BANKER_MENU: Raw[] = [
    { option: 'Walk here', action: WALK },
    { option: '@yel@Talk-to Banker', action: NPC_TALK },
    { option: '@yel@Bank Banker', action: NPC_BANK }
];

describe('presets', () => {
    it('promotes Bank above Talk-to, target-local (Walk-here untouched)', () => {
        const v = view(BANKER_MENU);
        applySwaps(v, settings());
        expect(top(v)).toBe('@yel@Bank Banker');
        expect(v.entries.find(e => e.option === 'Walk here')!.index).toBe(1);
    });

    it('does nothing when the preset is disabled', () => {
        const v = view(BANKER_MENU);
        applySwaps(v, settings({ 'npc-bank': false }));
        expect(top(v)).toBe('@yel@Bank Banker'); // client order already Bank-top here
        const v2 = view([...BANKER_MENU].reverse());
        applySwaps(v2, settings({ 'npc-bank': false }));
        expect(top(v2)).toBe('Walk here');
    });

    it('promotes Attack only when its preset is on', () => {
        const menu: Raw[] = [
            { option: '@yel@Talk-to Goblin', action: NPC_TALK },
            { option: '@yel@Attack Goblin', action: NPC_ATTACK }
        ];
        const off = view(menu);
        applySwaps(off, settings());
        expect(top(off)).toBe('@yel@Attack Goblin'); // already top, no-op either way
        const reversed = view([...menu].reverse());
        applySwaps(reversed, settings());
        expect(top(reversed)).toBe('@yel@Talk-to Goblin');
        const on = view([...menu].reverse());
        applySwaps(on, settings({ 'npc-attack': true }));
        expect(top(on)).toBe('@yel@Attack Goblin');
    });

    it('promotes Eat above Drop for held food', () => {
        const menu: Raw[] = [
            { option: 'Drop Cake', action: HELD_DROP },
            { option: 'Use Cake', action: HELD_USE },
            { option: 'Eat Cake', action: HELD_EAT }
        ];
        const v = view([...menu].reverse());
        applySwaps(v, settings());
        expect(top(v)).toBe('Eat Cake');
    });
});

describe('custom rules', () => {
    it('applies left rules and ignores shift rules without shift', () => {
        const v = view(BANKER_MENU);
        applySwaps(v, settings({ 'npc-bank': false }, 'banker => talk-to'));
        expect(top(v)).toBe('@yel@Talk-to Banker');
        const v2 = view(BANKER_MENU);
        applySwaps(v2, settings({ 'npc-bank': false }, 'banker +shift => talk-to'));
        expect(top(v2)).toBe('@yel@Bank Banker');
    });

    it('applies shift rules only while shift is held', () => {
        const shifted = view(BANKER_MENU, true);
        applySwaps(shifted, settings({ 'npc-bank': false, 'walk-deprioritize': false }, 'banker +shift => talk-to'));
        expect(top(shifted)).toBe('@yel@Talk-to Banker');
    });

    it('ignores malformed rule lines', () => {
        const v = view(BANKER_MENU);
        applySwaps(v, settings({ 'npc-bank': false }, 'garbage\n=> nope'));
        expect(top(v)).toBe('@yel@Bank Banker');
    });
});

describe('shift-gated presets', () => {
    it('sinks Walk-here to the bottom while shift is held', () => {
        const menu: Raw[] = [...BANKER_MENU].reverse(); // Walk-here top
        const v = view(menu, true);
        applySwaps(v, settings({ 'npc-bank': false }));
        expect(top(v)).not.toBe('Walk here');
        expect(v.entries.find(e => e.option === 'Walk here')!.index).toBe(1);
    });

    it('leaves Walk-here alone without shift', () => {
        const v = view([...BANKER_MENU].reverse());
        applySwaps(v, settings({ 'npc-bank': false }));
        expect(top(v)).toBe('Walk here');
    });

    it('promotes the largest bank quantity while shift is held', () => {
        const menu: Raw[] = [
            { option: 'Deposit-10 Coins', action: IF_BUTTON },
            { option: 'Deposit-1 Coins', action: IF_BUTTON },
            { option: 'Deposit-5 Coins', action: IF_BUTTON }
        ];
        const v = view(menu, true);
        applySwaps(v, settings());
        expect(top(v)).toBe('Deposit-10 Coins');
    });
});
