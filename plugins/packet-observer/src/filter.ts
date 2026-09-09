// Packet category rules for the observer filters (ADR-0014). Prefix-based:
// new opcodes fall into misc rather than vanishing silently. Pure + tested.

import type { PacketDirection } from '#api/packets.js';

export type PacketCategory = 'movement' | 'scene' | 'interface' | 'chat' | 'stat' | 'camera' | 'input' | 'anticheat' | 'action' | 'misc';

const UP_RULES: { category: PacketCategory; prefixes: string[] }[] = [
    { category: 'movement', prefixes: ['PLAYER_INFO', 'NPC_INFO'] },
    { category: 'scene', prefixes: ['OBJ_', 'LOC_', 'REBUILD_', 'MAP', 'UNSET_MAP'] },
    { category: 'interface', prefixes: ['IF_', 'UPDATE_INV_', 'TUT_'] },
    { category: 'chat', prefixes: ['MESSAGE_', 'CHAT_', 'FRIEND', 'IGNORE'] },
    { category: 'stat', prefixes: ['UPDATE_STAT', 'UPDATE_RUN'] },
    { category: 'camera', prefixes: ['CAM_'] }
];

const DOWN_RULES: { category: PacketCategory; prefixes: string[] }[] = [
    { category: 'input', prefixes: ['EVENT_', 'NO_TIMEOUT', 'IDLE_TIMER'] },
    { category: 'anticheat', prefixes: ['ANTICHEAT_'] },
    { category: 'action', prefixes: ['OP', 'INV_', 'IF_BUTTON'] }
];

export function categorize(direction: PacketDirection, name: string): PacketCategory {
    const rules = direction === 'upstream' ? UP_RULES : DOWN_RULES;
    for (const rule of rules) {
        for (const prefix of rule.prefixes) {
            if (name.startsWith(prefix)) {
                return rule.category;
            }
        }
    }
    return 'misc';
}

/** Category config key for a direction+category pair. */
export function categoryKey(direction: PacketDirection, category: PacketCategory): string {
    return `${direction === 'upstream' ? 'up' : 'down'}-${category}`;
}

/**
 * Free-text filter: comma-separated case-insensitive substrings matched
 * against the opcode name (`OBJ_*` works: `*` is stripped, everything is a
 * substring). Empty filter matches all.
 */
export function matchesTextFilter(filter: string, name: string): boolean {
    const tokens = filter
        .split(',')
        .map(token => token.replace(/\*/g, '').trim().toLowerCase())
        .filter(token => token.length > 0);
    if (tokens.length === 0) {
        return true;
    }
    const haystack = name.toLowerCase();
    return tokens.some(token => haystack.includes(token));
}
