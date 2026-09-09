// Pure menu-entry decoder: raw minimenu rows -> facade MenuEntry fields.
// No client imports (hard rule); the action table mirrors
// src/client/MiniMenuAction.ts ids with the 2000 priority bit stripped.

import type { MenuEntry } from '#api/types.js';
import { stripTags } from '#api/swaprules.js';

/** Base action ids (priority bit removed) grouped by interaction target. */
const NPC_OPS = new Set([240, 242, 209, 309, 852, 793, 829, 1714]);
const PLAYER_OPS = new Set([131, 639, 957, 499, 27, 387, 507, 185, 275]);
const LOC_OPS = new Set([899, 625, 721, 743, 357, 1071, 810, 1381]);
const OBJ_OPS = new Set([370, 139, 778, 617, 224, 662, 111, 1152]);
const HELD_OPS = new Set([563, 694, 962, 795, 681, 100, 398, 1328]);
const WALK = 718;

export function decodeTargetKind(action: number): string {
    const base = action >= 2000 ? action - 2000 : action;
    if (NPC_OPS.has(base)) {
        return 'npc';
    }
    if (PLAYER_OPS.has(base)) {
        return 'player';
    }
    if (LOC_OPS.has(base)) {
        return 'loc';
    }
    if (OBJ_OPS.has(base)) {
        return 'obj';
    }
    if (HELD_OPS.has(base)) {
        return 'held';
    }
    if (base === WALK) {
        return 'walk';
    }
    return 'interface';
}

/** Display name is the tail of "Option Name" with color tags stripped. */
export function decodeTargetName(option: string): string {
    const plain = stripTags(option);
    const space = plain.indexOf(' ');
    return space === -1 ? '' : plain.slice(space + 1).trim();
}

export function decodeMenuEntry(index: number, raw: { option: string; action: number; paramA: number; paramB: number; paramC: number }): MenuEntry {
    return {
        index,
        option: raw.option,
        action: raw.action,
        paramA: raw.paramA,
        paramB: raw.paramB,
        paramC: raw.paramC,
        targetKind: decodeTargetKind(raw.action),
        targetName: decodeTargetName(raw.option),
        isPriority: raw.action >= 2000
    };
}
