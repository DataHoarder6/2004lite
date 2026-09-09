// Combat value types + attack-rate table lookup (ADR-0011).
//
// Attack rates are server-authoritative ticks (0.6s) snapshotted from the
// Content repo at build time (scripts/regen-attackrates.ts). The client cache
// carries no speed fields, so plugins consume the checked-in snapshot.

export type CombatEntityKind = 'npc' | 'player';

export interface CombatEntity {
    /** Stable key across snapshots: `<kind>:<slot>`. */
    key: string;
    kind: CombatEntityKind;
    /** Client entity slot (npcIds/playerIds index target). */
    slot: number;
    /** NpcType id, or -1 for players. */
    typeId: number;
    name: string;
    health: number;
    totalHealth: number;
    /** Current attack animation, -1 when idle. */
    primaryAnim: number;
    /** Slot of the faced entity, -1 when none (client encoding). */
    faceEntity: number;
    /** loopCycle of the last received hit, -1000 when never. */
    combatCycle: number;
    /** Fine world coords (x/z) + model height, for the projector. */
    x: number;
    z: number;
    height: number;
}

export interface Hitsplat {
    type: number;
    value: number;
    cycle: number;
}

/** Versioned attack-rate snapshot shipped with the timer plugins. */
export interface AttackRateTable {
    /** Content commit the snapshot was generated from (drift detection). */
    contentCommit: string;
    /** Ticks per attack when no specific rate exists (server default: 4). */
    defaultRate: number;
    npc: Record<string, number>;
    weapon: Record<string, number>;
    /**
     * Obj ids whose category attacks rapid at style index 1
     * (bow/crossbow/thrown/javelin; combat.rs2 category mapping).
     */
    rapid: number[];
}

/** Style index with the -1 tick rapid rule (player_ranged.rs2). */
export const RAPID_STYLE_INDEX = 1;

/** Server varp id for %com_mode, the 0-3 style index (transmit=yes). */
export const COMBAT_MODE_VARP = 43;

export function npcAttackRate(table: AttackRateTable, typeId: number): number {
    return table.npc[String(typeId)] ?? table.defaultRate;
}

export function weaponAttackRate(table: AttackRateTable, objId: number): number {
    return table.weapon[String(objId)] ?? table.defaultRate;
}

/** True when the worn weapon attacks rapid at style index 1. */
export function isRapidWeapon(table: AttackRateTable, objId: number): boolean {
    return table.rapid.includes(objId);
}

export interface ScreenPoint {
    x: number;
    y: number;
}
