// Menu-swapper rule engine (pure: fake MenuSwapView in tests).
//
// Two layers, applied in order:
//   1. presets — 2004-relevant RuneLite-parity swaps, each behind a boolean
//      (or the stairs enum). Non-shift menus only, except shift-gated ones.
//   2. custom rules — parsed `custom-rules` text. When shift is held the
//      shift rules replace the left rules for their targets (RuneLite: the
//      shift swap overrides); otherwise the left rules apply.
//
// Every swap is target-local: the promoted entry swaps with the topmost entry
// of the SAME target group, never stealing left-click from another target's
// menu (e.g. Walk-here mixed into an NPC menu).

import type { MenuEntry, MenuSwapView } from '#api/plugin.js';
import { parseCustomRules, splitOption } from '#api/swaprules.js';

export type StairsMode = 'off' | 'up' | 'down';

export interface SwapperSettings {
    get(key: string): boolean | number | string;
    getRulesText(): string;
}

interface View {
    entries: ReadonlyArray<MenuEntry>;
    isShiftDown: boolean;
    swap(i: number, j: number): boolean;
}

function groupKey(entry: MenuEntry): string {
    const target = entry.targetName.trim().toLowerCase();
    return target !== '' ? target : entry.option.toLowerCase();
}

function verbOf(entry: MenuEntry): string {
    return splitOption(entry.option).verb;
}

/**
 * Swap the highest matching entry with the top of its target group.
 * Returns true when a swap happened.
 */
export function promoteVerb(view: View, verbs: string[], match: (entry: MenuEntry) => boolean): boolean {
    const lowered = verbs.map(v => v.toLowerCase());
    const groups = new Map<string, { top: number; cand: number }>();
    for (const entry of view.entries) {
        if (!match(entry)) {
            continue;
        }
        const key = groupKey(entry);
        let group = groups.get(key);
        if (!group) {
            group = { top: entry.index, cand: -1 };
            groups.set(key, group);
        } else if (entry.index > group.top) {
            group.top = entry.index;
        }
        if (lowered.some(v => verbOf(entry).startsWith(v)) && entry.index > group.cand) {
            group.cand = entry.index;
        }
    }
    let swapped = false;
    for (const group of groups.values()) {
        if (group.cand !== -1 && group.cand < group.top) {
            swapped = view.swap(group.cand, group.top) || swapped;
        }
    }
    return swapped;
}

function isNpc(entry: MenuEntry): boolean {
    return entry.targetKind === 'npc';
}

function isLoc(entry: MenuEntry): boolean {
    return entry.targetKind === 'loc';
}

function isHeld(entry: MenuEntry): boolean {
    return entry.targetKind === 'held';
}

function isInterface(entry: MenuEntry): boolean {
    return entry.targetKind === 'interface';
}

function isWalk(entry: MenuEntry): boolean {
    return entry.targetKind === 'walk';
}

const QUANTITY_RANK: Record<string, number> = { '1': 1, '5': 2, '10': 3, x: 4, all: 5 };

function quantityRank(verb: string): number {
    const dash = verb.lastIndexOf('-');
    const suffix = (dash === -1 ? verb : verb.slice(dash + 1)).toLowerCase();
    return QUANTITY_RANK[suffix] ?? 0;
}

/**
 * Shift-gated bank quantities: within each interface target group offering
 * several Deposit-/Withdraw- verbs, the largest quantity becomes top.
 */
function applyBankShift(view: View): void {
    const groups = new Map<string, MenuEntry[]>();
    for (const entry of view.entries) {
        if (!isInterface(entry)) {
            continue;
        }
        const verb = verbOf(entry);
        if (!verb.startsWith('deposit-') && !verb.startsWith('withdraw-')) {
            continue;
        }
        const key = `${groupKey(entry)}:${verb.split('-')[0]}`;
        let group = groups.get(key);
        if (!group) {
            group = [];
            groups.set(key, group);
        }
        group.push(entry);
    }
    for (const group of groups.values()) {
        if (group.length < 2) {
            continue;
        }
        const top = group.reduce((a, b) => (a.index > b.index ? a : b));
        const best = group.reduce((a, b) => (quantityRank(verbOf(a)) >= quantityRank(verbOf(b)) ? a : b));
        if (best.index !== top.index) {
            view.swap(best.index, top.index);
        }
    }
}

/** Shift-gated Walk-here deprioritize: Walk-here sinks to the menu bottom. */
function applyWalkDeprioritize(view: View): void {
    let walkIndex = -1;
    let bottomIndex = -1;
    for (const entry of view.entries) {
        if (bottomIndex === -1 || entry.index < bottomIndex) {
            bottomIndex = entry.index;
        }
        if (isWalk(entry) && entry.index > walkIndex) {
            walkIndex = entry.index;
        }
    }
    if (walkIndex !== -1 && bottomIndex !== -1 && walkIndex !== bottomIndex) {
        view.swap(walkIndex, bottomIndex);
    }
}

function flag(settings: SwapperSettings, key: string): boolean {
    return settings.get(key) === true;
}

function applyPresets(view: View, settings: SwapperSettings): void {
    if (flag(settings, 'npc-bank')) {
        promoteVerb(view, ['bank'], isNpc);
    }
    if (flag(settings, 'npc-trade')) {
        promoteVerb(view, ['trade'], isNpc);
    }
    if (flag(settings, 'npc-travel')) {
        promoteVerb(view, ['travel', 'sail', 'pay-fare', 'charter'], isNpc);
    }
    if (flag(settings, 'npc-attack')) {
        promoteVerb(view, ['attack'], isNpc);
    }
    if (flag(settings, 'loc-bank')) {
        promoteVerb(view, ['bank'], isLoc);
    }
    if (flag(settings, 'loc-open')) {
        promoteVerb(view, ['open'], isLoc);
    }
    const stairs = settings.get('stairs-mode');
    if (stairs === 'up') {
        promoteVerb(view, ['climb-up'], isLoc);
    } else if (stairs === 'down') {
        promoteVerb(view, ['climb-down'], isLoc);
    }
    if (flag(settings, 'item-eat')) {
        promoteVerb(view, ['eat'], isHeld);
    }
    if (flag(settings, 'item-bury')) {
        promoteVerb(view, ['bury'], isHeld);
    }
}

function applyCustomRules(view: View, settings: SwapperSettings, shift: boolean): void {
    for (const rule of parseCustomRules(settings.getRulesText())) {
        if (rule.shift !== shift) {
            continue;
        }
        promoteVerb(view, [rule.option], e => e.targetName.trim().toLowerCase() === rule.target);
    }
}

export function applySwaps(view: MenuSwapView, settings: SwapperSettings): void {
    const narrow: View = { entries: view.entries, isShiftDown: view.isShiftDown, swap: (i, j) => view.swap(i, j) };
    if (view.isShiftDown) {
        // Shift swaps override left customs for their targets; shift-gated
        // presets still apply.
        applyCustomRules(narrow, settings, true);
        if (flag(settings, 'bank-shift')) {
            applyBankShift(narrow);
        }
        if (flag(settings, 'walk-deprioritize')) {
            applyWalkDeprioritize(narrow);
        }
        return;
    }
    applyPresets(narrow, settings);
    applyCustomRules(narrow, settings, false);
}
