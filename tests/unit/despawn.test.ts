// Despawn estimate windows: private stacks count the full window,
// reveal-origin stacks only their public phase (ADR-0012).

import { describe, expect, it } from 'vitest';

import { PUBLIC_WINDOW_TICKS, STANDARD_WINDOW_TICKS, TICK_MS, remainingMs, remainingTicks, spawnWindowTicks, windowFractionLeft } from '../../plugins/ground-items/src/despawn.js';

describe('spawnWindowTicks', () => {
    it('gives revealed stacks the shorter public-phase window', () => {
        expect(spawnWindowTicks(false)).toBe(STANDARD_WINDOW_TICKS);
        expect(spawnWindowTicks(true)).toBe(PUBLIC_WINDOW_TICKS);
        expect(PUBLIC_WINDOW_TICKS).toBeLessThan(STANDARD_WINDOW_TICKS);
    });
});

describe('remainingMs/remainingTicks', () => {
    it('counts down the matching window from spawn', () => {
        const at = 1_000_000;
        expect(remainingMs(at, at, false)).toBe(STANDARD_WINDOW_TICKS * TICK_MS);
        expect(remainingMs(at, at, true)).toBe(PUBLIC_WINDOW_TICKS * TICK_MS);
        expect(remainingTicks(at, at, false)).toBe(STANDARD_WINDOW_TICKS);
        expect(remainingTicks(at, at, true)).toBe(PUBLIC_WINDOW_TICKS);
    });

    it('goes non-positive at window end', () => {
        const at = 1_000_000;
        const end = at + PUBLIC_WINDOW_TICKS * TICK_MS;
        expect(remainingMs(at, end, true)).toBe(0);
        expect(remainingTicks(at, end, true)).toBe(0);
        expect(remainingMs(at, end + 1, true)).toBeLessThan(0);
    });
});

describe('windowFractionLeft', () => {
    it('is 1 at spawn, null once expired', () => {
        const at = 1_000_000;
        expect(windowFractionLeft(at, at, false)).toBe(1);
        expect(windowFractionLeft(at, at + STANDARD_WINDOW_TICKS * TICK_MS, false)).toBeNull();
    });
});
