// Every plugin checkbox/field declares a panel-valid schema: keys unique,
// labels present, defaults match their type, enums offer their default,
// numbers stay in range. Catches panel-breaking schema mistakes for all
// toggles in milliseconds (no browser needed for this layer).

import { describe, expect, it } from 'vitest';

import type { ConfigField, ConfigSchema } from '#api/config.js';
import type { EventBus } from '#api/events.js';
import type { Plugin, PluginContext, PluginManifest } from '#api/plugin.js';
import { TARGET_CLIENT_BUILD } from '#api/index.js';

import attackTimer from '../../plugins/attack-timer/src/index.js';
import attackTimerManifest from '../../plugins/attack-timer/manifest.json';
import npcAttackTimer from '../../plugins/npc-attacktimer/src/index.js';
import npcAttackTimerManifest from '../../plugins/npc-attacktimer/manifest.json';
import groundItems from '../../plugins/ground-items/src/index.js';
import groundItemsManifest from '../../plugins/ground-items/manifest.json';
import menuSwapper from '../../plugins/menu-swapper/src/index.js';
import menuSwapperManifest from '../../plugins/menu-swapper/manifest.json';
import inventoryValue from '../../plugins/inventory-value/src/index.js';
import inventoryValueManifest from '../../plugins/inventory-value/manifest.json';
import cameraZoom from '../../plugins/camera-zoom/src/index.js';
import cameraZoomManifest from '../../plugins/camera-zoom/manifest.json';
import xpTracker from '../../plugins/xp-tracker/src/index.js';
import xpTrackerManifest from '../../plugins/xp-tracker/manifest.json';
import sideTabs from '../../plugins/side-tabs/src/index.js';
import sideTabsManifest from '../../plugins/side-tabs/manifest.json';
import thickSkin from '../../plugins/thick-skin/src/index.js';
import thickSkinManifest from '../../plugins/thick-skin/manifest.json';

const PLUGINS: { plugin: Plugin; manifest: PluginManifest }[] = [
    { plugin: attackTimer, manifest: attackTimerManifest as PluginManifest },
    { plugin: npcAttackTimer, manifest: npcAttackTimerManifest as PluginManifest },
    { plugin: groundItems, manifest: groundItemsManifest as PluginManifest },
    { plugin: menuSwapper, manifest: menuSwapperManifest as PluginManifest },
    { plugin: inventoryValue, manifest: inventoryValueManifest as PluginManifest },
    { plugin: cameraZoom, manifest: cameraZoomManifest as PluginManifest },
    { plugin: xpTracker, manifest: xpTrackerManifest as PluginManifest },
    { plugin: sideTabs, manifest: sideTabsManifest as PluginManifest },
    { plugin: thickSkin, manifest: thickSkinManifest as PluginManifest }
];

function startCapture(plugin: Plugin, manifest: PluginManifest): ConfigSchema | null {
    let schema: ConfigSchema | null = null;
    const events = { on: (): void => {}, off: (): void => {} } as unknown as EventBus;
    const ctx = {
        manifest,
        events,
        hotkeys: { on: (): void => {}, off: (): void => {} },
        // Start-time client surface some plugins touch (handlers run live).
        client: { setCameraPitch: (): boolean => true, loopCycle: 0 },
        config: { get: (): string => '', set: (): boolean => false },
        declareConfig: (declared: Omit<ConfigSchema, 'pluginId'>) => {
            schema = { pluginId: manifest.id, fields: declared.fields };
            return ctx.config;
        },
        setOverlay: (): void => {},
        setMenuSwapper: (): void => {},
        log: (): void => {}
    } as unknown as PluginContext;
    plugin.start(ctx);
    return schema;
}

function checkField(pluginId: string, field: ConfigField): void {
    expect(field.key.length, `${pluginId}: empty key`).toBeGreaterThan(0);
    expect(field.label.length, `${pluginId}/${field.key}: empty label`).toBeGreaterThan(0);
    switch (field.type) {
        case 'boolean':
            expect(typeof field.default, `${pluginId}/${field.key}: default not boolean`).toBe('boolean');
            break;
        case 'number':
            expect(typeof field.default, `${pluginId}/${field.key}: default not number`).toBe('number');
            if (field.min !== undefined) {
                expect(field.default, `${pluginId}/${field.key}: default below min`).toBeGreaterThanOrEqual(field.min);
            }
            if (field.max !== undefined) {
                expect(field.default, `${pluginId}/${field.key}: default above max`).toBeLessThanOrEqual(field.max);
            }
            break;
        case 'enum':
            expect(field.options.length, `${pluginId}/${field.key}: no options`).toBeGreaterThan(0);
            expect(field.options, `${pluginId}/${field.key}: default not an option`).toContain(field.default);
            break;
        case 'string':
            expect(typeof field.default, `${pluginId}/${field.key}: default not string`).toBe('string');
            break;
    }
}

describe('plugin manifests', () => {
    it('target this client build with a loadable entry', () => {
        const ids = new Set<string>();
        for (const { manifest } of PLUGINS) {
            expect(manifest.targetClientBuild, `${manifest.id}: wrong build`).toBe(TARGET_CLIENT_BUILD);
            expect(manifest.entry.length, `${manifest.id}: empty entry`).toBeGreaterThan(0);
            expect(ids.has(manifest.id), `duplicate plugin id ${manifest.id}`).toBe(false);
            ids.add(manifest.id);
        }
    });
});

describe('plugin config schemas', () => {
    it('every checkbox/field is panel-valid and uniquely keyed', () => {
        for (const { plugin, manifest } of PLUGINS) {
            const schema = startCapture(plugin, manifest);
            expect(schema, `${manifest.id}: declares no config`).not.toBeNull();
            const keys = new Set<string>();
            for (const field of schema!.fields) {
                expect(keys.has(field.key), `${manifest.id}: duplicate key ${field.key}`).toBe(false);
                keys.add(field.key);
                checkField(manifest.id, field);
            }
        }
    });
});
