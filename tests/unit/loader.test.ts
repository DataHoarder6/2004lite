// Loader: manifest validation + version gating + failure policy (ADR-0007/0009).

import { describe, expect, it } from 'vitest';
import { parsePluginManifest, PluginRegistry } from '../../host/loader';
import type { PluginContext, PluginManifest as ManifestT } from '#api/plugin';

function manifest(overrides: Record<string, unknown> = {}): unknown {
    return {
        id: 'demo',
        name: 'Demo',
        version: '1.0.0',
        entry: 'index.js',
        facade: '0.1.0',
        targetClientBuild: 274,
        ...overrides
    };
}

describe('parsePluginManifest', () => {
    it('accepts a valid manifest', () => {
        expect(parsePluginManifest(manifest())).toMatchObject({ id: 'demo', targetClientBuild: 274 });
    });

    it('rejects non-objects and missing fields', () => {
        expect(() => parsePluginManifest(null)).toThrow();
        expect(() => parsePluginManifest({})).toThrow();
        expect(() => parsePluginManifest(manifest({ id: undefined }))).toThrow();
        expect(() => parsePluginManifest(manifest({ targetClientBuild: '274' }))).toThrow();
    });

    it('enforces kebab-case ids', () => {
        expect(() => parsePluginManifest(manifest({ id: 'My Plugin' }))).toThrow();
        expect(() => parsePluginManifest(manifest({ id: 'my_plugin' }))).toThrow();
        expect(() => parsePluginManifest(manifest({ id: 'my-plugin' }))).not.toThrow();
    });
});

describe('PluginRegistry failure policy', () => {
    function registry() {
        const stateChanges: string[][] = [];
        const reg = new PluginRegistry(
            () => ({}) as PluginContext,
            () => stateChanges.push(reg.all().map(p => `${p.manifest.id}:${p.enabled}`))
        );
        return { reg, stateChanges };
    }

    it('a plugin that throws in start is recorded failed and disabled, not propagated', () => {
        const { reg, stateChanges } = registry();
        const plugin = {
            start(): void {
                throw new Error('bad plugin');
            }
        };
        const loaded = {
            manifest: parsePluginManifest(manifest()) as ManifestT,
            plugin,
            enabled: false,
            error: null,
            context: {} as PluginContext
        };
        reg.enable(loaded);
        expect(loaded.enabled).toBe(false);
        expect(loaded.error).toBe('bad plugin');
        expect(stateChanges).toHaveLength(1);
    });

    it('stop errors during disable are swallowed', () => {
        const { reg } = registry();
        const plugin = {
            start(): void {},
            stop(): void {
                throw new Error('stop boom');
            }
        };
        const loaded = {
            manifest: parsePluginManifest(manifest()) as ManifestT,
            plugin,
            enabled: true,
            error: null,
            context: {} as PluginContext
        };
        expect(() => reg.disable(loaded)).not.toThrow();
        expect(loaded.enabled).toBe(false);
    });
});
