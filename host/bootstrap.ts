// 2004lite host bootstrap. Wires instrumentation hooks to the plugin runtime:
// cycle-end state diff -> events -> plugin handlers; draw tail -> overlays;
// minimenu tail -> menu swaps; loader/registry/panel lifecycle.
//
// Boot happens inside the client bundle (AGENTS.md gotcha), triggered by the
// marked call in src/client/Client.ts's constructor.

import { ClientHooks } from './hooks.js';
import type { CycleEndContext, DrawOverlaysContext, HostClientState, MinimenuContext } from './hooks.js';
import { QueuedEventBus } from './bus.js';
import { PluginRegistry } from './loader.js';
import { PluginConfig } from './config.js';
import { StateDiffer } from './differ.js';
import { SettingsPanel } from './panel.js';
import type { PluginContext, PluginManifest } from '#api/plugin.js';
import type { Overlay } from '#api/overlay.js';
import type { ConfigField } from '#api/config.js';
import type { Inventory } from '#api/types.js';
import { FACADE_VERSION, TARGET_CLIENT_BUILD } from '#api/index.js';
import { SKILL_NAMES, SKILL_USED } from './skills.js';

/** comId of the main inventory interface. 2004 build 274. */
const INVENTORY_COMID = 3214;

export class Host {
    private readonly bus = new QueuedEventBus();
    private readonly differ = new StateDiffer();
    private readonly registry: PluginRegistry;
    private readonly panel: SettingsPanel;
    private overlays = new Map<string, Overlay>();
    private menuSwappers = new Map<string, (view: import('#api/plugin.js').MenuSwapView) => void>();
    private declaredSchemas = new Map<string, import('#api/config.js').ConfigSchema>();
    private lastState: HostClientState | null = null;
    private lastInventoryEvent: Inventory | null = null;

    constructor(private readonly baseUrl: string = '') {
        this.registry = new PluginRegistry(
            manifest => this.createContext(manifest),
            () => this.onPluginStateChange()
        );
        this.panel = new SettingsPanel(
            (id, enabled) => {
                this.registry.setEnabled(id, enabled);
            },
            pluginId => this.declaredSchemas.get(pluginId) ?? null
        );
        this.bus.onHandlerError = (kind, error) => {
            console.warn(`[2004lite] handler for ${kind} threw:`, error);
        };
    }

    async boot(): Promise<void> {
        this.wireHooks();
        this.bindPanelHotkey();
        await this.loadPlugins();
        console.log(`[2004lite] host ready (facade ${FACADE_VERSION}, build ${TARGET_CLIENT_BUILD})`);
    }

    private wireHooks(): void {
        ClientHooks.onCycleEnd((ctx: CycleEndContext) => this.onCycle(ctx));
        ClientHooks.onDrawOverlays((ctx: DrawOverlaysContext) => this.onDraw(ctx));
        ClientHooks.onMinimenu((ctx: MinimenuContext) => this.onMenu(ctx));
    }

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
        const entries = ctx.entries.slice(1);
        const view: import('#api/plugin.js').MenuSwapView = {
            entries: entries.map((e, i) => ({
                index: i + 1,
                option: e.option,
                action: e.action,
                paramA: e.paramA,
                paramB: e.paramB,
                paramC: e.paramC
            })),
            swap: (i: number, j: number): boolean => ctx.swap(i, j)
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
        this.overlays.delete(pluginId);
        this.menuSwappers.delete(pluginId);
    }

    private createContext(manifest: PluginManifest): PluginContext {
        const config = new PluginConfig(manifest.id);

        return {
            manifest,
            events: this.busView(manifest.id),
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
            setCameraPitch: (pitch: number) => latest()?.setCameraPitch(pitch) ?? false
        };
    }

    private busView(pluginId: string): import('#api/events.js').EventBus {
        return {
            on: (kind, handler) => {
                this.bus.on(kind, handler);
                const entry = { off: () => this.bus.off(kind, handler) };
                let list = this.busViews.get(pluginId);
                if (!list) {
                    list = [];
                    this.busViews.set(pluginId, list);
                }
                list.push(entry);
            },
            off: (kind, handler) => {
                this.bus.off(kind, handler);
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
