// Host capture UX: shift+right-click offers, click persistence, reset.

import { describe, expect, it } from 'vitest';

import { buildCaptureOffer, MenuCapture } from '../../host/capture.js';
import type { MinimenuContext, MinimenuEntry } from '../../host/hooks.js';

function raw(option: string): MinimenuEntry {
    return { option, action: 242, paramA: 0, paramB: 0, paramC: 0 };
}

/** Fake client-side context: entries array + append/swap over it. */
function context(entries: MinimenuEntry[], isShiftDown: boolean): MinimenuContext & { appended: string[] } {
    const appended: string[] = [];
    const ctx: MinimenuContext & { appended: string[] } = {
        entries,
        isShiftDown,
        appended,
        swap: () => true,
        appendEntry: (option: string): number => {
            appended.push(option);
            entries.push({ option, action: 1106, paramA: 0, paramB: 0, paramC: 0 });
            return entries.length - 1;
        }
    };
    return ctx;
}

const BANKER_MENU = [raw('Cancel'), raw('Walk here'), raw('@yel@Talk-to Banker'), raw('@yel@Bank Banker')];

describe('buildCaptureOffer', () => {
    it('focuses the largest multi-verb target group', () => {
        const offer = buildCaptureOffer(BANKER_MENU.slice(1), '');
        expect(offer).toMatchObject({ target: 'banker', display: 'Banker', hasRules: false });
        expect(offer!.verbs).toEqual(expect.arrayContaining(['bank', 'talk-to']));
    });

    it('returns null for single-verb menus and flags existing rules', () => {
        expect(buildCaptureOffer([raw('Walk here')], '')).toBeNull();
        const offer = buildCaptureOffer(BANKER_MENU.slice(1), 'banker => bank');
        expect(offer!.hasRules).toBe(true);
    });
});

describe('MenuCapture', () => {
    function harness(enabled = true, rules = '') {
        let stored = rules;
        let renders = 0;
        const logs: unknown[][] = [];
        const capture = new MenuCapture({
            isSwapperEnabled: () => enabled,
            getRulesText: () => stored,
            setRulesText: text => {
                stored = text;
            },
            rerender: () => {
                renders += 1;
            },
            log: (...parts: unknown[]) => {
                logs.push(parts);
            }
        });
        return { capture, stored: () => stored, renders: () => renders, logs };
    }

    it('appends left/shift rows per verb on shift+right-click, persists on click', () => {
        const h = harness();
        const ctx = context(BANKER_MENU.slice(), true);
        h.capture.menuBuilt(ctx);
        expect(ctx.appended).toContain('> Left-click: Bank (Banker)');
        expect(ctx.appended).toContain('> Shift-click: Talk-to (Banker)');
        expect(ctx.appended.some(o => o.startsWith('> Reset'))).toBe(false);

        const leftBank = ctx.entries.findIndex(e => e.option === '> Left-click: Bank (Banker)');
        expect(h.capture.clickConsumed(leftBank)).toBe(true);
        expect(h.stored()).toBe('banker => bank');
        expect(h.renders()).toBe(1);
        // menu closed after click: unrelated clicks pass through
        expect(h.capture.clickConsumed(leftBank)).toBe(false);
    });

    it('offers reset when rules exist and deletes both variants', () => {
        const h = harness(true, 'banker => bank\nbanker +shift => talk-to');
        const ctx = context(BANKER_MENU.slice(), true);
        h.capture.menuBuilt(ctx);
        const reset = ctx.entries.findIndex(e => e.option === '> Reset swaps (Banker)');
        expect(reset).not.toBe(-1);
        expect(h.capture.clickConsumed(reset)).toBe(true);
        expect(h.stored()).toBe('');
    });

    it('stays quiet without shift or when the swapper is disabled', () => {
        const h = harness();
        const noShift = context(BANKER_MENU.slice(), false);
        h.capture.menuBuilt(noShift);
        expect(noShift.appended).toEqual([]);
        const disabled = context(BANKER_MENU.slice(), true);
        const h2 = harness(false);
        h2.capture.menuBuilt(disabled);
        expect(disabled.appended).toEqual([]);
        expect(h.capture.clickConsumed(3)).toBe(false);
    });
});
