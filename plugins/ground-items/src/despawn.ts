// Despawn estimate windows (ADR-0012). Server truth (Engine-TS Obj):
// stacks with a receiver stay private for Obj.REVEAL = 100 ticks, then go
// public; lifecycle (100/200/300 ticks by source) runs from spawn. So a
// private-from-spawn stack (own drop, killer loot) gets the standard window,
// while a reveal-origin stack is ~100 ticks old already and counts down only
// its public phase. Durations aren't on the wire — this stays an estimate.

export const TICK_MS = 600;

/** Private-from-spawn stacks: full standard loot window. */
export const STANDARD_WINDOW_TICKS = 200;

/** Reveal-origin stacks: public phase after the 100-tick private phase. */
export const PUBLIC_WINDOW_TICKS = 100;

export function spawnWindowTicks(revealed: boolean): number {
    return revealed ? PUBLIC_WINDOW_TICKS : STANDARD_WINDOW_TICKS;
}

export function remainingMs(spawnAtMs: number, nowMs: number, revealed: boolean): number {
    return spawnWindowTicks(revealed) * TICK_MS - (nowMs - spawnAtMs);
}

export function remainingTicks(spawnAtMs: number, nowMs: number, revealed: boolean): number {
    return Math.ceil(remainingMs(spawnAtMs, nowMs, revealed) / TICK_MS);
}

/** 1 at spawn, 0 at despawn, null when expired/unknown. */
export function windowFractionLeft(spawnAtMs: number, nowMs: number, revealed: boolean): number | null {
    const window = spawnWindowTicks(revealed) * TICK_MS;
    const fraction = 1 - (nowMs - spawnAtMs) / window;
    return fraction <= 0 ? null : Math.min(fraction, 1);
}
