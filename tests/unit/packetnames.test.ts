// Packet-name snapshot integrity (ADR-0014): shape plus byte-identical
// regen from the protocol enums (no drift).

import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SNAPSHOT = path.resolve('data', 'packet-names.json');

describe('packet-names snapshot', () => {
    it('maps known opcodes both directions', () => {
        const table = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf-8')) as { up: Record<string, string>; down: Record<string, string> };
        expect(table.up['52']).toBe('OBJ_DEL');
        expect(table.down['9']).toBe('IF_BUTTON');
        expect(Object.keys(table.up).length).toBeGreaterThan(50);
        expect(Object.keys(table.down).length).toBeGreaterThan(50);
    });

    it('regenerates byte-identically (no drift)', () => {
        const before = fs.readFileSync(SNAPSHOT, 'utf-8');
        execSync('bun run scripts/gen-packet-names.ts', { encoding: 'utf-8' });
        expect(fs.readFileSync(SNAPSHOT, 'utf-8')).toBe(before);
    });
});
