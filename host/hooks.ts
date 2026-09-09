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
    setCameraPitch(pitch: number): boolean;
    readInventory(comId: number): { ids: Int32Array; counts: Int32Array } | null;
    readObjDef(id: number): { name: string; cost: number } | null;
    /** All ground-item stacks in build-area coords, world-adjusted. */
    readGroundItems(): HostGroundStack[];
    /**
     * World tile -> screen via getOverlayPos math. Null when offscreen.
     * Reads live camera state, so overlays call it per-frame.
     */
    projectTile(tileX: number, tileZ: number, level: number, height: number): { x: number; y: number } | null;
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
    swap: MinimenuSwap;
}

type CycleEndHook = (ctx: CycleEndContext) => void;
type DrawOverlaysHook = (ctx: DrawOverlaysContext) => void;
type MinimenuHook = (ctx: MinimenuContext) => void;

export class ClientHooks {
    private static cycleEnd: CycleEndHook | null = null;
    private static drawOverlays: DrawOverlaysHook | null = null;
    private static minimenuMutate: MinimenuHook | null = null;

    static onCycleEnd(hook: CycleEndHook): void {
        this.cycleEnd = hook;
    }

    static onDrawOverlays(hook: DrawOverlaysHook): void {
        this.drawOverlays = hook;
    }

    static onMinimenu(hook: MinimenuHook): void {
        this.minimenuMutate = hook;
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
