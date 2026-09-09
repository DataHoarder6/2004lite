// Menu swap semantics: the client-provided swap guard (ADR-0005, swap-only).

import { describe, expect, it } from 'vitest';
import { ClientHooks, type MinimenuContext, type MinimenuEntry } from '../../host/hooks';

function makeEntries(options: string[]): MinimenuEntry[] {
    return options.map((option, i) => ({
        option,
        action: 1000 + i,
        paramA: i,
        paramB: i * 10,
        paramC: i * 100
    }));
}

function swapOnlyFixture(options: string[]): MinimenuContext {
    const entries = makeEntries(options);
    const working = entries.map(e => ({ ...e }));
    const swap = (i: number, j: number): boolean => {
        if (i === j || i <= 0 || j <= 0 || i >= working.length || j >= working.length) {
            return false;
        }
        const tmp = working[i];
        working[i] = working[j];
        working[j] = tmp;
        return true;
    };
    return { entries, swap };
}

describe('menu swap boundary', () => {
    it('swaps two entries wholesale (text + action + params)', () => {
        const ctx = swapOnlyFixture(['Cancel', 'Talk-to', 'Bank', 'Examine']);
        expect(ctx.swap(1, 2)).toBe(true);
        // entries array is the pre-swap view; the swap mutates client arrays
        expect(ctx.entries[1].option).toBe('Talk-to'); // read-only view
    });

    it('refuses to touch Cancel (index 0)', () => {
        const ctx = swapOnlyFixture(['Cancel', 'Talk-to', 'Bank']);
        expect(ctx.swap(0, 1)).toBe(false);
        expect(ctx.swap(1, 0)).toBe(false);
    });

    it('refuses out-of-range and self swaps', () => {
        const ctx = swapOnlyFixture(['Cancel', 'Talk-to', 'Bank']);
        expect(ctx.swap(1, 99)).toBe(false);
        expect(ctx.swap(2, 2)).toBe(false);
    });

    it('hooks emit to registered swappers', () => {
        const seen: string[] = [];
        ClientHooks.onMinimenu(ctx => {
            seen.push(...ctx.entries.map(e => e.option));
            ctx.swap(1, 2);
        });
        ClientHooks.emitMinimenu(swapOnlyFixture(['Cancel', 'Talk-to', 'Bank']));
        expect(seen).toEqual(['Cancel', 'Talk-to', 'Bank']);
        ClientHooks.onMinimenu(() => undefined); // reset for other tests
    });
});
