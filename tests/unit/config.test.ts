import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PluginConfig } from '../../host/config';
import type { ConfigField } from '#api/config';

// node env has no localStorage; shim it (host targets the browser bundle).
class MemoryStorage {
    private map = new Map<string, string>();
    getItem(key: string): string | null {
        return this.map.get(key) ?? null;
    }
    setItem(key: string, value: string): void {
        this.map.set(key, value);
    }
    removeItem(key: string): void {
        this.map.delete(key);
    }
    clear(): void {
        this.map.clear();
    }
}

vi.stubGlobal('localStorage', new MemoryStorage());

const FIELDS: ConfigField[] = [
    { key: 'on', label: 'On', type: 'boolean', default: true },
    { key: 'count', label: 'Count', type: 'number', default: 5, min: 1, max: 10 },
    { key: 'mode', label: 'Mode', type: 'enum', default: 'fast', options: ['fast', 'slow'] },
    { key: 'name', label: 'Name', type: 'string', default: 'anonymous' }
];

describe('PluginConfig (localStorage persistence, ADR-0008)', () => {
    beforeEach(() => {
        localStorage.clear();
    });
    afterEach(() => {
        localStorage.clear();
    });

    it('returns schema defaults before any set', () => {
        const config = new PluginConfig('test-plugin');
        config.declare(FIELDS);
        expect(config.get('on')).toBe(true);
        expect(config.get('count')).toBe(5);
        expect(config.get('mode')).toBe('fast');
    });

    it('persists across instances', () => {
        const first = new PluginConfig('test-plugin');
        first.declare(FIELDS);
        expect(first.set('count', 9)).toBe(true);

        const second = new PluginConfig('test-plugin');
        second.declare(FIELDS);
        expect(second.get('count')).toBe(9);
    });

    it('rejects unknown keys', () => {
        const config = new PluginConfig('test-plugin');
        config.declare(FIELDS);
        expect(config.set('nope', 1)).toBe(false);
    });

    it('rejects wrong types and range violations', () => {
        const config = new PluginConfig('test-plugin');
        config.declare(FIELDS);
        expect(config.set('on', 'yes')).toBe(false);
        expect(config.set('count', 0)).toBe(false);
        expect(config.set('count', 11)).toBe(false);
        expect(config.set('count', 7)).toBe(true);
    });

    it('rejects enum values outside options', () => {
        const config = new PluginConfig('test-plugin');
        config.declare(FIELDS);
        expect(config.set('mode', 'turbo')).toBe(false);
        expect(config.set('mode', 'slow')).toBe(true);
    });

    it('reset restores defaults', () => {
        const config = new PluginConfig('test-plugin');
        config.declare(FIELDS);
        config.set('count', 2);
        config.reset();
        expect(config.get('count')).toBe(5);
    });
});
