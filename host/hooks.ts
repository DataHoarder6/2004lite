// 2004lite instrumentation contract.
//
// The host registers implementations for these hook slots; the marked
// one-line calls in src/client/Client.ts delegate here. Everything a plugin
// can observe or mutate flows through this module. Facade and host code never
// imports Client internals directly; this module is the boundary object that
// upstream calls with explicitly-passed state.

export interface HostChatLine {
    type: number;
    text: string;
    sender: string;
    cycle: number;
}

export interface HostGroundStack {
    level: number;
    /** World tile coords (build-area + mapBuildBase). */
    tileX: number;
    tileZ: number;
    id: number;
    count: number;
}

/** A stack that arrived via OBJ_REVEAL (world coords, matched by the differ). */
export interface HostRevealedStack {
    level: number;
    tileX: number;
    tileZ: number;
    id: number;
}

export interface HostCombatHitsplat {
    type: number;
    value: number;
    cycle: number;
}

export interface HostCombatEntity {
    key: string;
    kind: 'npc' | 'player';
    slot: number;
    typeId: number;
    name: string;
    health: number;
    totalHealth: number;
    primaryAnim: number;
    faceEntity: number;
    combatCycle: number;
    x: number;
    z: number;
    height: number;
    hitsplats: HostCombatHitsplat[];
}

export interface HostClientState {
    ingame: boolean;
    loopCycle: number;
    /**
     * Wall-clock server-tick index (600ms boundaries). The client runs ~50
     * frames/s; countdown logic keys off this, never loopCycle (ADR-0006).
     */
    tick: number;
    statXP: Int32Array;
    statBaseLevel: Int32Array;
    statEffectiveLevel: Int32Array;
    runEnergy: number;
    weight: number;
    mapPosition: { tileX: number; tileZ: number } | null;
    camera: {
        pitch: number;
        yaw: number;
    };
    chat: HostChatLine[];
    entities: HostCombatEntity[];
    /** True while the player is typing (chatbox text or a modal input). */
    typing: boolean;
    /**
     * Switch the side-panel tab (0-12). Client-local, no packet — the same
     * flags the icon row sets. False for empty slots.
     */
    setSideTab(index: number): boolean;
    /**
     * Press a toggle-button component (TOGGLE_BUTTON path: packet + instant
     * local varp flip). False when logged out or the com is no toggle.
     */
    pressToggleButton(comId: number): boolean;
    /**
     * Worn right-hand obj id (local player's appearance slot 3,
     * 0x200+objId when a weapon is worn). Null when unarmed: the server
     * falls back to attackrate 4 (player_melee/ranged.rs2). Read by the
     * attack-timer plugin for weapon-period lookup (ADR-0011).
     */
    wornWeaponId: number | null;
    /**
     * Server combat-style index (%com_mode, varp 43): 0-3 within the worn
     * weapon's category. The attack timer pairs it with the rapid snapshot
     * (rapid only exists at index 1 on bow/crossbow/thrown).
     */
    combatMode: number;
    setCameraPitch(pitch: number): boolean;
    readInventory(comId: number): { ids: Int32Array; counts: Int32Array } | null;
    readObjDef(id: number): { name: string; cost: number } | null;
    /** All ground-item stacks in build-area coords, world-adjusted. */
    readGroundItems(): HostGroundStack[];
    /**
     * Stacks revealed to the player since the last tick (OBJ_REVEAL,
     * world coords). ~100 ticks old already (server Obj.REVEAL): the despawn
     * estimate counts their public phase (ADR-0012).
     */
    revealed: HostRevealedStack[];
    /**
     * World tile -> screen via getOverlayPos math. Null when offscreen.
     * Reads live camera state, so overlays call it per-frame.
     */
    projectTile(tileX: number, tileZ: number, level: number, height: number): { x: number; y: number } | null;
    projectToScreen(x: number, z: number, height: number): { x: number; y: number } | null;
}

export interface CycleEndContext {
    loopCycle: number;
    ingame: boolean;
    state: HostClientState;
}

export interface DrawOverlaysContext {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    loopCycle: number;
    ingame: boolean;
}

export interface MinimenuEntry {
    option: string;
    action: number;
    paramA: number;
    paramB: number;
    paramC: number;
}

export type MinimenuSwap = (i: number, j: number) => boolean;

export interface MinimenuContext {
    entries: MinimenuEntry[];
    /** Live shift state sampled at menu-build time (ADR-0011). */
    isShiftDown: boolean;
    swap: MinimenuSwap;
    /**
     * Append a host-owned row (capture UX, ADR-0011). Inert CANCEL action;
     * rebuilt every menu build. Returns the index, or -1 at capacity.
     */
    appendEntry: (option: string) => number;
}

type CycleEndHook = (ctx: CycleEndContext) => void;
type DrawOverlaysHook = (ctx: DrawOverlaysContext) => void;
type MinimenuHook = (ctx: MinimenuContext) => void;
type MenuClickConsumer = (index: number) => boolean;

export class ClientHooks {
    private static cycleEnd: CycleEndHook | null = null;
    private static drawOverlays: DrawOverlaysHook | null = null;
    private static minimenuMutate: MinimenuHook | null = null;
    private static menuClick: MenuClickConsumer | null = null;

    static onCycleEnd(hook: CycleEndHook): void {
        this.cycleEnd = hook;
    }

    static onDrawOverlays(hook: DrawOverlaysHook): void {
        this.drawOverlays = hook;
    }

    static onMinimenu(hook: MinimenuHook): void {
        this.minimenuMutate = hook;
    }

    /** Host consumes clicks on its own capture rows (ADR-0011). */
    static onMenuClick(consumer: MenuClickConsumer): void {
        this.menuClick = consumer;
    }

    /** True when the host consumed the click (client must skip doAction). */
    static consumeMenuClick(index: number): boolean {
        return this.menuClick?.(index) ?? false;
    }

    static emitCycleEnd(ctx: CycleEndContext): void {
        this.cycleEnd?.(ctx);
    }

    static emitDrawOverlays(ctx: DrawOverlaysContext): void {
        this.drawOverlays?.(ctx);
    }

    static emitMinimenu(ctx: MinimenuContext): void {
        this.minimenuMutate?.(ctx);
    }
}
