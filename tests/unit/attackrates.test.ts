// Attack-rate snapshot integrity (ADR-0011): shape, server-known spot
// values, and determinism of the generator against live Content.

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

import type { AttackRateTable } from '#api/combat.js';

const SNAPSHOT = path.resolve('data', 'attackrates.json');

function load(): AttackRateTable {
    return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf-8')) as AttackRateTable;
}

describe('attackrates snapshot', () => {
    it('has the expected shape and server default', () => {
        const table = load();
        expect(table.defaultRate).toBe(4);
        expect(typeof table.contentCommit).toBe('string');
        expect(Object.keys(table.npc).length).toBeGreaterThan(50);
        expect(Object.keys(table.weapon).length).toBeGreaterThan(50);
        for (const rate of [...Object.values(table.npc), ...Object.values(table.weapon)]) {
            expect(Number.isInteger(rate)).toBe(true);
            expect(rate).toBeGreaterThan(0);
        }
    });

    it('matches server-known rates (Content ground truth)', () => {
        const table = load();
        expect(table.npc['7']).toBe(6); // farmer1: param=attackrate,6
        expect(table.weapon['863']).toBe(3); // iron_knife: param=attackrate,3
    });

    it('regenerates byte-identically from Content (no drift)', () => {
        const contentDir = process.env.CONTENT_DIR;
        if (!contentDir || !fs.existsSync(path.join(contentDir, 'scripts'))) {
            console.warn('skipping drift check: set CONTENT_DIR to a Content checkout');
            return;
        }
        const before = fs.readFileSync(SNAPSHOT, 'utf-8');
        execSync('bun run scripts/regen-attackrates.ts', { encoding: 'utf-8' });
        expect(fs.readFileSync(SNAPSHOT, 'utf-8')).toBe(before);
    });
});
