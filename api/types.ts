// Domain value types exposed on the facade. No client internals leak through
// (ADR-0002): everything is plain data.

export interface SkillSnapshot {
    /** 0-based skill index, matching the client's Skill order. */
    index: number;
    /** Canonical lowercase skill name (e.g. 'attack'); '-unused-' slots never emit. */
    name: string;
    xp: number;
    baseLevel: number;
    effectiveLevel: number;
}

export interface MapPosition {
    tileX: number;
    tileZ: number;
}

export interface InventoryItem {
    slot: number;
    /** ObjType id; 0 = empty slot. */
    id: number;
    count: number;
}

export interface Inventory {
    comId: number;
    items: InventoryItem[];
}

export type ChatType = 'game' | 'player' | 'private-in' | 'private-out' | 'trade-request' | 'duel-request' | 'other';

export interface ChatMessage {
    type: ChatType;
    text: string;
    sender: string;
    cycle: number;
}

export interface MenuEntry {
    /** 1-based index into the right-click menu; 0 (Cancel) never included. */
    index: number;
    option: string;
    /** Raw MiniMenuAction id, including the priority bit. */
    action: number;
    paramA: number;
    paramB: number;
    paramC: number;
    /** Decoded interaction target kind (npc, player, loc, obj, interface). */
    targetKind: string;
    /** Target display name stripped of color tags, '' when none. */
    targetName: string;
    /** True when the raw action carries the priority bit (>1000). */
    isPriority: boolean;
}
