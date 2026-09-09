// Host plugin registry + loader. Loads ESM plugin artifacts from
// $ENGINE_DIR/public/plugins/<id>/ (ADR-0009), guards facade/build versions,
// and enforces the failure policy (ADR-0007).

import type { Plugin, PluginContext, PluginManifest } from '#api/plugin.js';
import { TARGET_CLIENT_BUILD } from '#api/index.js';

export interface LoadedPlugin {
    manifest: PluginManifest;
    plugin: Plugin;
    enabled: boolean;
    error: string | null;
    context: PluginContext;
}

export type PluginIndexEntry = Pick<PluginManifest, 'id' | 'name' | 'version' | 'facade' | 'targetClientBuild'>;

export class PluginRegistry {
    private loaded = new Map<string, LoadedPlugin>();
    private failures: PluginLoadError[] = [];

    constructor(
        private readonly createContext: (manifest: PluginManifest) => PluginContext,
        private readonly onStateChange: () => void
    ) {}

    all(): LoadedPlugin[] {
        return [...this.loaded.values()];
    }

    /** Plugins that failed to load, with reasons (surfaced in the panel). */
    loadFailures(): PluginLoadError[] {
        return [...this.failures];
    }

    get(id: string): LoadedPlugin | undefined {
        return this.loaded.get(id);
    }

    async loadIndex(baseUrl: string): Promise<string[]> {
        try {
            const res = await fetch(`${baseUrl}/plugins/index.json`);
            if (!res.ok) {
                throw new Error(`index fetch failed: ${res.status}`);
            }
            const index = (await res.json()) as PluginIndexEntry[];
            if (!Array.isArray(index)) {
                throw new Error('index.json is not an array');
            }
            return index.map(entry => entry.id);
        } catch {
            // No index = no plugins, no error (ADR-0009).
            return [];
        }
    }

    async load(id: string, baseUrl: string): Promise<LoadedPlugin | null> {
        if (this.loaded.has(id)) {
            return this.loaded.get(id)!;
        }

        let manifest: PluginManifest;
        try {
            const res = await fetch(`${baseUrl}/plugins/${id}/manifest.json`);
            if (!res.ok) {
                throw new Error(`manifest fetch failed: ${res.status}`);
            }
            manifest = parsePluginManifest(await res.json());
        } catch (error) {
            const reason = `bad manifest: ${message(error)}`;
            this.failures.push({ id, reason });
            console.warn(`[2004lite] plugin ${id}: ${reason}`, error);
            return null;
        }

        if (manifest.targetClientBuild !== TARGET_CLIENT_BUILD) {
            const reason = `targets build ${manifest.targetClientBuild}, host is ${TARGET_CLIENT_BUILD}`;
            this.failures.push({ id, reason });
            console.warn(`[2004lite] plugin ${id}: ${reason}; refusing`);
            return null;
        }

        try {
            const module = await import(/* @vite-ignore */ `${baseUrl}/plugins/${id}/${manifest.entry}`);
            const plugin: Plugin = module.default ?? module.plugin;
            if (!plugin || typeof plugin.start !== 'function') {
                throw new Error('default export is not a Plugin');
            }

            const context = this.createContext(manifest);
            const loaded: LoadedPlugin = {
                manifest,
                plugin,
                enabled: false,
                error: null,
                context
            };
            this.loaded.set(id, loaded);
            this.enable(loaded);
            return loaded;
        } catch (error) {
            const reason = `load failed: ${message(error)}`;
            this.failures.push({ id, reason });
            console.warn(`[2004lite] plugin ${id}: ${reason}`, error);
            return null;
        }
    }

    enable(loaded: LoadedPlugin): void {
        if (loaded.enabled) {
            return;
        }
        try {
            loaded.plugin.start(loaded.context);
            loaded.enabled = true;
            loaded.error = null;
        } catch (error) {
            this.fail(loaded, error);
            return; // fail() already notified
        }
        this.onStateChange();
    }

    disable(loaded: LoadedPlugin): void {
        if (!loaded.enabled) {
            return;
        }
        loaded.enabled = false;
        try {
            loaded.plugin.stop?.();
        } catch (error) {
            console.warn(`[2004lite] plugin ${loaded.manifest.id}: stop threw:`, error);
        }
        this.onStateChange();
    }

    /** Failure policy (ADR-0007): disable, record, keep the game running. */
    fail(loaded: LoadedPlugin, error: unknown): void {
        loaded.enabled = false;
        loaded.error = error instanceof Error ? error.message : String(error);
        try {
            loaded.plugin.stop?.();
        } catch {
            // already failing; ignore secondary errors
        }
        console.warn(`[2004lite] plugin ${loaded.manifest.id} disabled after error:`, error);
        this.onStateChange();
    }

    setEnabled(id: string, enabled: boolean): boolean {
        const loaded = this.loaded.get(id);
        if (!loaded) {
            return false;
        }
        if (enabled) {
            if (loaded.error) {
                return false; // failed plugins restart via explicit reload only
            }
            this.enable(loaded);
        } else {
            this.disable(loaded);
        }
        return loaded.enabled === enabled;
    }
}

export interface PluginLoadError {
    id: string;
    reason: string;
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// Manifest validation: plain function so plugin authors can reuse it.
export function parsePluginManifest(raw: unknown): PluginManifest {
    if (typeof raw !== 'object' || raw === null) {
        throw new Error('manifest must be an object');
    }
    const m = raw as Record<string, unknown>;
    for (const key of ['id', 'name', 'version', 'entry', 'facade'] as const) {
        if (typeof m[key] !== 'string' || (m[key] as string).length === 0) {
            throw new Error(`manifest missing string field: ${key}`);
        }
    }
    if (typeof m.targetClientBuild !== 'number') {
        throw new Error('manifest missing number field: targetClientBuild');
    }
    if (!/^[a-z0-9-]+$/.test(m.id as string)) {
        throw new Error(`manifest id must be kebab-case: ${String(m.id)}`);
    }
    return raw as PluginManifest;
}
