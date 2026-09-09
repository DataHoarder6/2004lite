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

/** Main backpack interface id (build 274). The host watches it every cycle. */
export const INVENTORY_COMID = 3214;

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

/** One stack resting on a tile, as seen by the local player. */
export interface GroundItem {
    /** Stable key: level/worldX/worldZ/id. */
    key: string;
    /** ObjType id. */
    id: number;
    name: string;
    qty: number;
    level: number;
    /** World tile coords (mapBuildBase-adjusted). */
    tileX: number;
    tileZ: number;
    /** Derived alch values (CONTEXT.md): floor(cost*6/10) / floor(cost*4/10). */
    highAlch: number;
    lowAlch: number;
    /** First-seen loopCycle (client estimate basis, ADR-0012). */
    firstSeenCycle: number;
    /** True when first observed via reveal (was private for ~100 ticks). */
    revealed: boolean;
}

/** Screen projection of a ground tile; null when offscreen/behind camera. */
export interface GroundProjection {
    x: number;
    y: number;
}
