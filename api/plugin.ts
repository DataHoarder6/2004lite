// Facade plugin contract: what a plugin exports and the context it receives.

import type { ConfigSchema, ConfigStore } from './config.js';
import type { EventBus } from './events.js';
import type { Overlay } from './overlay.js';
import type { ChatMessage, Inventory, MapPosition, MenuEntry, SkillSnapshot } from './types.js';
import type { CombatEntity, ScreenPoint } from './combat.js';

/** Manifest shape: manifest.json beside the built plugin entry. */
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    entry: string;
    /** Facade version the plugin was built against, semver-ish. */
    facade: string;
    /** Client build the plugin targets (must equal TARGET_CLIENT_BUILD). */
    targetClientBuild: number;
    /** Hub fields, optional for sideload (ADR-0003). */
    repository?: string;
    commit?: string;
}

export interface ClientState {
    /** True from login screen exit until logout. */
    readonly ingame: boolean;
    readonly loopCycle: number;
    skill(index: number): SkillSnapshot | null;
    skills(): SkillSnapshot[];
    runEnergy: number;
    mapPosition(): MapPosition | null;
    readInventory(comId: number): Inventory | null;
    /** Cache object definition (name + shop cost). Null for unknown ids. */
    objDef(id: number): { name: string; cost: number } | null;
    recentChat(max: number): ChatMessage[];
    cameraPitch(): number;
    /** Benign client-local write (ADR-0005): clamp-range camera pitch. */
    setCameraPitch(pitch: number): boolean;
    /** Visible combat entities (local player + NPCs + players), freshest cycle. */
    combatEntities(): CombatEntity[];
    /** The local player entity, null outside the game world. */
    localPlayer(): CombatEntity | null;
    /**
     * Project fine world coords to screen pixels (for entity-anchored
     * overlays). Null when behind the camera or off-screen.
     */
    worldToScreen(x: number, z: number, height: number): ScreenPoint | null;
}

export interface MenuSwapper {
    /**
     * Inspect the current right-click menu (post-sort, Cancel excluded) and
     * request swaps. Swap-only (ADR-0005, CONTEXT.md): entries are never
     * added, removed, or have their identity rewritten beyond position.
     */
    swap(entries: MenuSwapView): void;
}

export interface MenuSwapView {
    entries: ReadonlyArray<MenuEntry>;
    /** Live shift state sampled at menu-build time (ADR-0011). */
    isShiftDown: boolean;
    /** Exchange two entries by index. Returns false (no-op) for invalid indices. */
    swap(i: number, j: number): boolean;
}

export interface PluginContext {
    manifest: PluginManifest;
    events: EventBus;
    config: ConfigStore;
    /** Live client state view (read + benign local writes, ADR-0005). */
    client: ClientState;
    /** Declare the plugin's settings; also (re)renders the settings panel. */
    declareConfig(schema: Omit<ConfigSchema, 'pluginId'>): ConfigStore;
    /** Register a canvas overlay (replaces any previous one). */
    setOverlay(overlay: Overlay): void;
    /**
     * Register the plugin's right-click menu swapper (swap-only, ADR-0005).
     * Called each game cycle after the client builds and sorts the menu.
     */
    setMenuSwapper(swapper: (view: MenuSwapView) => void): void;
    /** Client-local logging; surfaced in the host console + settings panel. */
    log(...parts: unknown[]): void;
}

export interface Plugin {
    /** Called once after load, before any events. Throw here = disabled. */
    start(context: PluginContext): void;
    /** Called on disable (subscriptions dropped, overlays hidden either way). */
    stop?(): void;
}

export function definePlugin(factory: (ctx: PluginContext) => Plugin | void): Plugin {
    let active: Plugin | void;
    return {
        start(context: PluginContext): void {
            active = factory(context);
            if (active && typeof active === 'object' && 'start' in active) {
                active.start(context);
            }
        },
        stop(): void {
            if (active && typeof active === 'object' && 'stop' in active && typeof active.stop === 'function') {
                active.stop();
            }
            active = undefined;
        }
    };
}

/** Menu-swap capability, attached by plugins that need it. */
export interface WithMenuSwap {
    onMenu: MenuSwapper['swap'];
}

export function defineMenuPlugin(factory: (ctx: PluginContext) => WithMenuSwap): Plugin {
    return {
        start(context: PluginContext): void {
            const active = factory(context);
            context.setMenuSwapper(view => active.onMenu(view));
        },
        stop(): void {
            // host drops the swapper on disable (dropPluginEffects)
        }
    };
}

/** Re-exported for plugin convenience. */
export type { SkillSnapshot, Inventory, MapPosition, ChatMessage, MenuEntry };
export type { CombatEntity, CombatEntityKind, Hitsplat, AttackRateTable, ScreenPoint } from './combat.js';
export { npcAttackRate, weaponAttackRate } from './combat.js';
