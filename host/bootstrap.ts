// 2004lite host bootstrap. Wires instrumentation hooks to the plugin runtime:
// cycle-end state diff -> events -> plugin handlers; draw tail -> overlays;
// minimenu tail -> menu swaps; loader/registry/panel lifecycle.
//
// Boot happens inside the client bundle (AGENTS.md gotcha), triggered by the
// marked call in src/client/Client.ts's constructor.

import { ClientHooks } from './hooks.js';
import type { CycleEndContext, DrawOverlaysContext, HostClientState, MinimenuContext, TappedPacket } from './hooks.js';
import type { PacketHandler } from '#api/packets.js';
import packetNames from '../data/packet-names.json';
import { QueuedEventBus } from './bus.js';
import { PluginRegistry } from './loader.js';
import { PluginConfig } from './config.js';
import { StateDiffer } from './differ.js';
import { SettingsPanel } from './panel.js';
import type { PluginContext, PluginManifest } from '#api/plugin.js';
import type { HotkeyHandler } from '#api/hotkeys.js';
import type { Overlay } from '#api/overlay.js';
import type { ConfigField } from '#api/config.js';
import type { Inventory } from '#api/types.js';
import { INVENTORY_COMID } from '#api/types.js';
import { FACADE_VERSION, TARGET_CLIENT_BUILD } from '#api/index.js';
import { CUSTOM_RULES_KEY, MENU_SWAPPER_ID, isCaptureOption } from '#api/swaprules.js';
import { SKILL_NAMES, SKILL_USED } from './skills.js';
import { decodeMenuEntry } from './decode.js';
import { MenuCapture } from './capture.js';
import type { HostCombatEntity } from './hooks.js';

/** Client slot of the local player (mirrors LOCAL_PLAYER_INDEX in Client.ts). */
const LOCAL_PLAYER_SLOT = 2047;

function toCombatEntity(raw: HostCombatEntity): import('#api/combat.js').CombatEntity {
    return {
        key: raw.key,
        kind: raw.kind,
        slot: raw.slot,
        typeId: raw.typeId,
        name: raw.name,
        health: raw.health,
        totalHealth: raw.totalHealth,
        primaryAnim: raw.primaryAnim,
        faceEntity: raw.faceEntity,
        combatCycle: raw.combatCycle,
        x: raw.x,
        z: raw.z,
        height: raw.height
    };
}

/** Packet ring size for the __lite4 debug handle. */
const PACKET_RING_MAX = 2000;

export class Host {
    private readonly bus = new QueuedEventBus();
    private readonly differ = new StateDiffer();
    private readonly registry: PluginRegistry;
    private readonly panel: SettingsPanel;
    private overlays = new Map<string, Overlay>();
    private menuSwappers = new Map<string, (view: import('#api/plugin.js').MenuSwapView) => void>();
    private declaredSchemas = new Map<string, import('#api/config.js').ConfigSchema>();
    private readonly configs = new Map<string, PluginConfig>();
    private readonly capture: MenuCapture;
    private lastState: HostClientState | null = null;
    private lastInventoryEvent: Inventory | null = null;
    /** Named-key hotkey subscriptions per plugin id (dropped on disable). */
    private readonly hotkeys = new Map<string, { key: string; handler: HotkeyHandler }[]>();
    /** Packet-observer subscriptions per plugin id (dropped on disable). */
    private readonly packetSubs = new Map<string, Set<PacketHandler>>();
    /** Recent parsed packets for the __lite4 debug handle (ring). */
    private readonly packetRing: import('#api/packets.js').ParsedPacket[] = [];
    /** Latest swapper-view options + capture labels (debug/e2e observability). */
    private lastMenuOptions: string[] = [];
    /** Last published server-tick index (wall-clock, 600ms boundaries). */
    private lastTick = -1;

    constructor(private readonly baseUrl: string = '') {
        this.registry = new PluginRegistry(
            manifest => this.createContext(manifest),
            () => this.onPluginStateChange()
        );
        this.capture = new MenuCapture({
            isSwapperEnabled: () => this.registry.get(MENU_SWAPPER_ID)?.enabled ?? false,
            isCaptureArmed: () => this.configs.get(MENU_SWAPPER_ID)?.get<boolean>('capture-mode') ?? false,
            getRulesText: () => this.configs.get(MENU_SWAPPER_ID)?.get<string>(CUSTOM_RULES_KEY) ?? '',
            setRulesText: text => {
                const config = this.configs.get(MENU_SWAPPER_ID);
                if (!config) {
                    return;
                }
                if (!config.set(CUSTOM_RULES_KEY, text)) {
                    config.setRaw(CUSTOM_RULES_KEY, text);
                }
            },
            rerender: () => this.panel.render(this.registry.all()),
            log: (...parts: unknown[]) => console.log('[2004lite:menu-swapper]', ...parts)
        });
        this.panel = new SettingsPanel(
            (id, enabled) => {
                this.registry.setEnabled(id, enabled);
            },
            pluginId => this.declaredSchemas.get(pluginId) ?? null,
            () => this.registry.loadFailures()
        );
        this.bus.onHandlerError = (kind, error) => {
            console.warn(`[2004lite] handler for ${kind} threw:`, error);
        };
    }

    async boot(): Promise<void> {
        this.wireHooks();
        this.bindPanelHotkey();
        await this.loadPlugins();
        // Observability for e2e/smoke tests (ADR-0006): plugin states without
        // needing console (dropped in prod builds).
        (window as unknown as { __lite4?: unknown }).__lite4 = {
            facade: FACADE_VERSION,
            build: TARGET_CLIENT_BUILD,
            plugins: () =>
                this.registry.all().map(loaded => ({
                    id: loaded.manifest.id,
                    name: loaded.manifest.name,
                    enabled: loaded.enabled,
                    error: loaded.error
                })),
            objDef: (id: number) => this.clientView().objDef(id),
            inventory: () => this.lastInventoryEvent,
            menu: () => ({ entries: [...this.lastMenuOptions], capture: this.capture.labels() }),
            combat: () => this.clientView().combatEntities(),
            local: () => this.clientView().localPlayer(),
            packets: () => [...this.packetRing]
        };
        console.log(`[2004lite] host ready (facade ${FACADE_VERSION}, build ${TARGET_CLIENT_BUILD})`);
    }

    private wireHooks(): void {
        ClientHooks.onCycleEnd((ctx: CycleEndContext) => this.onCycle(ctx));
        ClientHooks.onDrawOverlays((ctx: DrawOverlaysContext) => this.onDraw(ctx));
        ClientHooks.onMinimenu((ctx: MinimenuContext) => this.onMenu(ctx));
        ClientHooks.onMenuClick(index => this.capture.clickConsumed(index));
        ClientHooks.onPacket(tap => this.onPacket(tap));
        window.addEventListener('keydown', this.onHotkey);
    }

    /** Packet-observer fanout (ADR-0014): names resolved, ring kept, guarded. */
    private onPacket(tap: TappedPacket): void {
        const table = tap.direction === 'upstream' ? packetNames.up : packetNames.down;
        const packet: import('#api/packets.js').ParsedPacket = {
            direction: tap.direction,
            opcode: tap.opcode,
            name: (table as Record<string, string>)[String(tap.opcode)] ?? `UNKNOWN-${tap.opcode}`,
            size: tap.size,
            note: tap.note,
            hex: tap.hex,
            loopCycle: this.lastState?.loopCycle ?? 0
        };
        this.packetRing.push(packet);
        if (this.packetRing.length > PACKET_RING_MAX) {
            this.packetRing.splice(0, this.packetRing.length - PACKET_RING_MAX);
        }
        for (const [pluginId, handlers] of this.packetSubs) {
            const loaded = this.registry.get(pluginId);
            if (!loaded?.enabled) {
                continue;
            }
            for (const handler of [...handlers]) {
                try {
                    handler(packet);
                } catch (error) {
                    this.registry.fail(loaded, error);
                    this.panel.render(this.registry.all());
                }
            }
        }
    }

    /**
     * Plugin hotkey dispatch (observe-only, ADR-0005). Skipped while logged
     * out, while typing, or when focus sits in a DOM field (panel inputs):
     * Tab especially must keep working for login fields and chat.
     */
    private onHotkey = (event: KeyboardEvent): void => {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
            return;
        }
        const state = this.lastState;
        if (!state?.ingame || state.typing) {
            return;
        }
        for (const [pluginId, subs] of this.hotkeys) {
            const loaded = this.registry.get(pluginId);
            if (!loaded?.enabled) {
                continue;
            }
            for (const sub of subs) {
                if (sub.key !== event.key) {
                    continue;
                }
                event.preventDefault();
                try {
                    sub.handler({ key: event.key });
                } catch (error) {
                    this.registry.fail(loaded, error);
                    this.panel.render(this.registry.all());
                }
            }
        }
    };

    private async loadPlugins(): Promise<void> {
        const ids = await this.registry.loadIndex(this.baseUrl);
        for (const id of ids) {
            const loaded = await this.registry.load(id, this.baseUrl);
            if (loaded) {
                console.log(`[2004lite] plugin loaded: ${loaded.manifest.name}`);
            }
        }
        this.panel.mount();
        this.panel.render(this.registry.all());
    }

    private bindPanelHotkey(): void {
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            // ctrl+alt+p, avoid game keys
            if (e.ctrlKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                this.panel.toggle();
                this.panel.render(this.registry.all());
            }
        });
    }

    private onCycle(ctx: CycleEndContext): void {
        this.lastState = ctx.state;
        // Coarse pulses first (tick, then per-frame cycle), so countdowns
        // advance before same-flush attack resets land. QueuedEventBus
        // flushes after all publishes anyway.
        if (ctx.state.tick !== this.lastTick) {
            this.lastTick = ctx.state.tick;
            this.bus.publish({ kind: 'tick', loopCycle: ctx.loopCycle, tick: ctx.state.tick });
        }
        this.bus.publish({ kind: 'cycle', loopCycle: ctx.loopCycle });
        this.differ.watchInventory(INVENTORY_COMID);
        const events = this.differ.snapshot(ctx.state);
        for (const event of events) {
            this.bus.publish(event);
            if (event.kind === 'inventory-changed') {
                this.lastInventoryEvent = event.inventory;
            }
        }
        this.bus.flush();
    }

    private onDraw(ctx: DrawOverlaysContext): void {
        if (!ctx.ingame) {
            return;
        }
        for (const loaded of this.registry.all()) {
            if (!loaded.enabled) {
                continue;
            }
            const overlay = this.overlays.get(loaded.manifest.id);
            if (!overlay) {
                continue;
            }
            try {
                overlay.render({ ctx: ctx.ctx, width: ctx.width, height: ctx.height, loopCycle: ctx.loopCycle });
            } catch (error) {
                this.registry.fail(loaded, error);
                this.overlays.delete(loaded.manifest.id);
                this.panel.render(this.registry.all());
            }
        }
    }

    private onMenu(ctx: MinimenuContext): void {
        // Cancel lives at index 0 in the client arrays; the facade view is
        // 1-based with Cancel excluded, and swap() maps back + guards 0.
        // Host capture rows (prefix `> `) never enter the swapper view, so
        // plugins can neither swap nor mistake them for game entries.
        // The view is live: swap() reorders view entries and retracks index
        // fields, so sequential plugin swaps observe consistent positions.
        const list = ctx.entries.flatMap((e, i) => (i === 0 || isCaptureOption(e.option) ? [] : [decodeMenuEntry(i, e)]));
        this.lastMenuOptions = list.map(e => e.option);
        const view: import('#api/plugin.js').MenuSwapView = {
            entries: list,
            // 2004lite: live shift sample travels with the built menu (ADR-0011)
            isShiftDown: ctx.isShiftDown,
            swap: (i: number, j: number): boolean => {
                const ok = ctx.swap(i, j);
                if (ok) {
                    const a = list.findIndex(e => e.index === i);
                    const b = list.findIndex(e => e.index === j);
                    if (a !== -1 && b !== -1) {
                        [list[a], list[b]] = [list[b], list[a]];
                        list[a].index = i;
                        list[b].index = j;
                    }
                }
                return ok;
            }
        };
        for (const [id, swapper] of this.menuSwappers) {
            const loaded = this.registry.get(id);
            if (!loaded?.enabled) {
                continue;
            }
            try {
                swapper(view);
            } catch (error) {
                this.registry.fail(loaded, error);
                this.menuSwappers.delete(id);
                this.panel.render(this.registry.all());
            }
        }
        // Host chrome last: shift+right-click capture rows for the
        // menu-swapper (ADR-0011). Appended after swappers, invisible to them.
        this.capture.menuBuilt(ctx);
    }

    private onPluginStateChange(): void {
        for (const loaded of this.registry.all()) {
            if (!loaded.enabled) {
                this.dropPluginEffects(loaded.manifest.id);
            }
        }
        this.panel.render(this.registry.all());
    }

    private dropPluginEffects(pluginId: string): void {
        const subs = this.busViews.get(pluginId);
        if (subs) {
            for (const sub of subs) {
                sub.off();
            }
            this.busViews.delete(pluginId);
        }
        this.hotkeys.delete(pluginId);
        this.packetSubs.delete(pluginId);
        this.overlays.delete(pluginId);
        this.menuSwappers.delete(pluginId);
    }

    private createContext(manifest: PluginManifest): PluginContext {
        const config = new PluginConfig(manifest.id);
        this.configs.set(manifest.id, config);

        return {
            manifest,
            events: this.busView(manifest.id),
            hotkeys: this.hotkeyView(manifest.id),
            packets: this.packetView(manifest.id),
            client: this.clientView(),
            config,
            declareConfig: (schema: { fields: ConfigField[] }) => {
                config.declare(schema.fields);
                this.declaredSchemas.set(manifest.id, { pluginId: manifest.id, fields: schema.fields });
                this.panel.render(this.registry.all());
                return config;
            },
            /** Menu-swap capability (ADR-0005, swap-only). */
            setMenuSwapper: (swapper: (view: import('#api/plugin.js').MenuSwapView) => void) => {
                this.menuSwappers.set(manifest.id, swapper);
            },
            setOverlay: (o: Overlay) => {
                this.overlays.set(manifest.id, o);
            },
            log: (...parts: unknown[]) => {
                console.log(`[2004lite:${manifest.id}]`, ...parts);
            }
        };
    }

    // Bus view: subscriptions tagged by plugin id so disable drops them.
    private busViews = new Map<string, { off: () => void }[]>();

    /** Live facade ClientState over the freshest snapshot (ADR-0005). */
    private clientView(): import('#api/plugin.js').ClientState {
        const latest = () => this.lastState;
        return {
            get ingame() {
                return latest()?.ingame ?? false;
            },
            get loopCycle() {
                return latest()?.loopCycle ?? 0;
            },
            skill: (index: number) => {
                const state = latest();
                if (!state || index < 0 || index >= state.statXP.length || !SKILL_USED[index]) {
                    return null;
                }
                return {
                    index,
                    name: SKILL_NAMES[index],
                    xp: state.statXP[index],
                    baseLevel: state.statBaseLevel[index],
                    effectiveLevel: state.statEffectiveLevel[index]
                };
            },
            skills: () => {
                const state = latest();
                if (!state) {
                    return [];
                }
                const result: import('#api/types.js').SkillSnapshot[] = [];
                for (let i = 0; i < state.statXP.length; i++) {
                    if (SKILL_USED[i] && state.statXP[i] > 0) {
                        result.push({
                            index: i,
                            name: SKILL_NAMES[i],
                            xp: state.statXP[i],
                            baseLevel: state.statBaseLevel[i],
                            effectiveLevel: state.statEffectiveLevel[i]
                        });
                    }
                }
                return result;
            },
            get runEnergy() {
                return latest()?.runEnergy ?? 0;
            },
            mapPosition: () => latest()?.mapPosition ?? null,
            objDef: (id: number) => {
                const state = latest();
                if (!state?.readObjDef) {
                    return null;
                }
                try {
                    const def = state.readObjDef(id);
                    if (!def) {
                        return null;
                    }
                    return {
                        name: def.name,
                        cost: def.cost,
                        highAlch: Math.max(Math.floor((def.cost * 6) / 10), 1),
                        lowAlch: Math.max(Math.floor((def.cost * 4) / 10), 1)
                    };
                } catch {
                    return null;
                }
            },
            groundItems: () => this.differ.ground(),
            projectTile: (tileX: number, tileZ: number, level: number, height: number) => {
                try {
                    return latest()?.projectTile?.(tileX, tileZ, level, height) ?? null;
                } catch {
                    return null;
                }
            },
            readInventory: (comId: number) => {
                const state = latest();
                const raw = state?.readInventory(comId);
                if (!raw) {
                    return null;
                }
                const items: import('#api/types.js').InventoryItem[] = [];
                for (let slot = 0; slot < raw.ids.length; slot++) {
                    items.push({ slot, id: raw.ids[slot], count: raw.counts[slot] });
                }
                return { comId, items };
            },
            recentChat: (_max: number) => [] as import('#api/types.js').ChatMessage[],
            cameraPitch: () => latest()?.camera.pitch ?? 128,
            setCameraPitch: (pitch: number) => latest()?.setCameraPitch(pitch) ?? false,
            setSideTab: (index: number) => latest()?.setSideTab(index) ?? false,
            pressToggleButton: (comId: number) => latest()?.pressToggleButton(comId) ?? false,
            wornWeaponId: () => latest()?.wornWeaponId ?? null,
            combatMode: () => latest()?.combatMode ?? 0,
            combatEntities: () => latest()?.entities.map(toCombatEntity) ?? [],
            localPlayer: () => {
                const entities = latest()?.entities ?? [];
                const local = entities.find(e => e.kind === 'player' && e.slot === LOCAL_PLAYER_SLOT);
                return local ? toCombatEntity(local) : null;
            },
            worldToScreen: (x: number, z: number, height: number) => latest()?.projectToScreen(x, z, height) ?? null
        };
    }

    /** Packet view: subscriptions tagged by plugin id so disable drops them. */
    private packetView(pluginId: string): import('#api/packets.js').PacketBus {
        return {
            on: (handler: PacketHandler) => {
                let set = this.packetSubs.get(pluginId);
                if (!set) {
                    set = new Set();
                    this.packetSubs.set(pluginId, set);
                }
                set.add(handler);
            },
            off: (handler: PacketHandler) => {
                this.packetSubs.get(pluginId)?.delete(handler);
            }
        };
    }

    /** Hotkey view: subscriptions tagged by plugin id so disable drops them. */
    private hotkeyView(pluginId: string): import('#api/hotkeys.js').HotkeyBus {
        return {
            on: (key: string, handler: HotkeyHandler) => {
                let list = this.hotkeys.get(pluginId);
                if (!list) {
                    list = [];
                    this.hotkeys.set(pluginId, list);
                }
                list.push({ key, handler });
            },
            off: (key: string, handler: HotkeyHandler) => {
                const list = this.hotkeys.get(pluginId);
                if (list) {
                    const at = list.findIndex(sub => sub.key === key && sub.handler === handler);
                    if (at !== -1) {
                        list.splice(at, 1);
                    }
                }
            }
        };
    }

    private busView(pluginId: string): import('#api/events.js').EventBus {
        const wrapped = new Map<(event: never) => void, (event: never) => void>();
        return {
            on: (kind, handler) => {
                const original = handler as unknown as (event: never) => void;
                const guarded = (event: never): void => {
                    try {
                        original(event);
                    } catch (error) {
                        const loaded = this.registry.get(pluginId);
                        if (loaded?.enabled) {
                            this.registry.fail(loaded, error);
                            this.panel.render(this.registry.all());
                        }
                    }
                };
                wrapped.set(original, guarded);
                this.bus.on(kind, guarded as never);
                const entry = { off: () => this.bus.off(kind, guarded as never) };
                let list = this.busViews.get(pluginId);
                if (!list) {
                    list = [];
                    this.busViews.set(pluginId, list);
                }
                list.push(entry);
            },
            off: (kind, handler) => {
                const original = handler as unknown as (event: never) => void;
                const guarded = (wrapped.get(original) ?? original) as never;
                wrapped.delete(original);
                this.bus.off(kind, guarded);
            }
        };
    }
}

let booted = false;

export async function bootHost(baseUrl = ''): Promise<void> {
    if (booted) {
        return;
    }
    booted = true;
    try {
        await new Host(baseUrl).boot();
    } catch (error) {
        console.warn('[2004lite] host boot failed; game continues without plugins:', error);
    }
}
