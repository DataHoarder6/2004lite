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
    setCameraPitch(pitch: number): boolean;
    readInventory(comId: number): { ids: Int32Array; counts: Int32Array } | null;
    readObjDef(id: number): { name: string; cost: number } | null;
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
