// Facade plugin contract: what a plugin exports and the context it receives.

import type { ConfigSchema, ConfigStore } from './config.js';
import type { EventBus } from './events.js';
import type { HotkeyBus } from './hotkeys.js';
import type { PacketBus } from './packets.js';
import type { Overlay } from './overlay.js';
import type { ChatMessage, GroundItem, GroundProjection, Inventory, MapPosition, MenuEntry, SkillSnapshot } from './types.js';
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
    /** Cache object definition (name + shop cost + derived alch values). Null for unknown ids. */
    objDef(id: number): { name: string; cost: number; highAlch: number; lowAlch: number } | null;
    /** All ground-item stacks currently visible to the player. */
    groundItems(): GroundItem[];
    /**
     * Project a world tile to screen coords via the client's 3D camera
     * (getOverlayPos math). Null when offscreen. Callable per-frame from
     * overlays; height is pixels above the ground.
     */
    projectTile(tileX: number, tileZ: number, level: number, height: number): GroundProjection | null;
    recentChat(max: number): ChatMessage[];
    cameraPitch(): number;
    /** Benign client-local write (ADR-0005): clamp-range camera pitch. */
    setCameraPitch(pitch: number): boolean;
    /**
     * Switch the side-panel tab (0-12, standard order: 3 inventory,
     * 4 equipment, 1 stats, 5 prayer...). Client-local, no packet — the
     * same state the icon row click path sets. False for empty slots.
     */
    setSideTab(index: number): boolean;
    /**
     * Press a toggle-button interface component (e.g. a prayer icon).
     * Replicates the client's TOGGLE_BUTTON path exactly (packet + instant
     * local varp flip); rejects non-toggle coms. False when invalid.
     */
    pressToggleButton(comId: number): boolean;
    /**
     * Press a select-button interface component (e.g. run/walk in the
     * controls tab). Replicates the SELECT_BUTTON path exactly. False when
     * invalid.
     */
    pressSelectButton(comId: number): boolean;
    /**
     * Read a client-synced varp (e.g. run mode). Null for unknown ids.
     * Observe-only; writing varps goes through button actions above.
     */
    readVarp(id: number): number | null;
    /**
     * Worn right-hand obj id for weapon attack-rate lookup (ADR-0011).
     * Null when unarmed: the server falls back to attackrate 4.
     */
    wornWeaponId(): number | null;
    /**
     * Server combat-style index (%com_mode, varp 43), 0-3 within the worn
     * weapon's category. No facade decoding: pair with the attackrate
     * snapshot's rapid list (ADR-0011).
     */
    combatMode(): number;
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
    /**
     * Exchange two entries by index. Returns false (no-op) for invalid
     * indices. The view updates immediately: entries reorder and their index
     * fields track current positions, so sequential swaps stay consistent.
     */
    swap(i: number, j: number): boolean;
}

export interface PluginContext {
    manifest: PluginManifest;
    events: EventBus;
    /** Named-key hotkeys (host->plugin observe-only, ADR-0005). */
    hotkeys: HotkeyBus;
    /** Read-only parsed packet tap (ADR-0014 observer, never a send path). */
    packets: PacketBus;
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
export type { SkillSnapshot, Inventory, MapPosition, ChatMessage, MenuEntry, GroundItem, GroundProjection };
export type { CombatEntity, CombatEntityKind, Hitsplat, AttackRateTable, ScreenPoint } from './combat.js';
export { npcAttackRate, weaponAttackRate } from './combat.js';
