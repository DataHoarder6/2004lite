// Host menu-swap capture UX (ADR-0011): shift+right-click appends host-owned
// rows offering the focused target's verbs as left/shift-click swaps, plus a
// reset row when rules exist. Clicks on those rows are consumed here and
// persisted into the menu-swapper's `custom-rules` text (single source of
// truth — the settings panel shows the same text for fallback/import-export).
//
// Capture rows are appended AFTER plugin swappers run, so the swapper view
// never contains them; the view builder additionally skips any row carrying
// the capture prefix, so they can never be swapped or mistaken for game
// entries even if the client ever reuses a menu across frames.

import { isCaptureOption, parseCustomRules, removeCustomRules, splitOption, upsertCustomRule } from '#api/swaprules.js';
import type { MinimenuContext, MinimenuEntry } from './hooks.js';

export interface CaptureOffer {
    /** Lowercased target key for rule storage. */
    target: string;
    /** Original-case target for row labels. */
    display: string;
    /** Lowercased distinct verbs, top-first, capped. */
    verbs: string[];
    /** True when custom rules already mention this target. */
    hasRules: boolean;
}

export interface PendingCapture {
    target: string;
    option: string;
    shift: boolean;
    reset: boolean;
}

/** Focused group = most entries (ties: highest top); needs 2+ verbs. */
export function buildCaptureOffer(game: MinimenuEntry[], rulesText: string, maxVerbs = 6): CaptureOffer | null {
    const groups = new Map<string, { display: string; top: number; verbs: string[] }>();
    let position = 0;
    for (const entry of game) {
        position += 1;
        const { verb, target } = splitOption(entry.option);
        if (target === '' || verb === '') {
            continue;
        }
        let group = groups.get(target);
        if (!group) {
            group = { display: splitDisplay(entry.option), top: -1, verbs: [] };
            groups.set(target, group);
        }
        // Client order is bottom-first, so the later position is nearer the
        // top (left-click end) of the menu.
        group.top = position;
        if (!group.verbs.includes(verb)) {
            group.verbs.push(verb);
        }
    }
    let best: { target: string; group: { display: string; top: number; verbs: string[] } } | null = null;
    for (const [target, group] of groups) {
        if (group.verbs.length < 2) {
            continue;
        }
        if (!best || group.verbs.length > best.group.verbs.length || (group.verbs.length === best.group.verbs.length && group.top > best.group.top)) {
            best = { target, group };
        }
    }
    if (!best) {
        return null;
    }
    const rules = parseCustomRules(rulesText);
    return {
        target: best.target,
        display: best.group.display,
        verbs: best.group.verbs.slice(-maxVerbs).reverse(),
        hasRules: rules.some(r => r.target === best!.target)
    };
}

function splitDisplay(option: string): string {
    const plain = option.replace(/@[a-z]+@/g, '').trim();
    const space = plain.indexOf(' ');
    return space === -1 ? plain : plain.slice(space + 1).trim();
}

function capitalize(word: string): string {
    return word === '' ? word : word[0].toUpperCase() + word.slice(1);
}

export interface CaptureDeps {
    isSwapperEnabled: () => boolean;
    /**
     * Shift-free capture (menu-swapper `capture-mode` config). Browsers force
     * their own menu on Shift+right-click (Firefox skips the contextmenu
     * event entirely), so capture rows must also be reachable without Shift.
     */
    isCaptureArmed: () => boolean;
    getRulesText: () => string;
    setRulesText: (text: string) => void;
    rerender: () => void;
    log: (...parts: unknown[]) => void;
}

export class MenuCapture {
    private pending = new Map<number, PendingCapture>();
    private lastLabels: string[] = [];

    constructor(private readonly deps: CaptureDeps) {}

    /** Labels appended to the most recent menu (debug/e2e observability). */
    labels(): string[] {
        return [...this.lastLabels];
    }

    /** Append capture rows for a shift+right-click (or capture-armed) menu. */
    menuBuilt(ctx: MinimenuContext): void {
        this.pending.clear();
        this.lastLabels = [];
        if ((!ctx.isShiftDown && !this.deps.isCaptureArmed()) || !this.deps.isSwapperEnabled()) {
            return;
        }
        const game = ctx.entries.filter((entry, i) => i !== 0 && !isCaptureOption(entry.option));
        const offer = buildCaptureOffer(game, this.deps.getRulesText());
        if (!offer) {
            return;
        }
        for (const verb of offer.verbs) {
            this.append(ctx, `> Left-click: ${capitalize(verb)} (${offer.display})`, { target: offer.target, option: verb, shift: false, reset: false });
            this.append(ctx, `> Shift-click: ${capitalize(verb)} (${offer.display})`, { target: offer.target, option: verb, shift: true, reset: false });
        }
        if (offer.hasRules) {
            this.append(ctx, `> Reset swaps (${offer.display})`, { target: offer.target, option: '', shift: false, reset: true });
        }
    }

    /** True when the click hit a capture row (client must skip doAction). */
    clickConsumed(index: number): boolean {
        const capture = this.pending.get(index);
        if (!capture) {
            return false;
        }
        const before = this.deps.getRulesText();
        const after = capture.reset ? removeCustomRules(before, capture.target) : upsertCustomRule(before, capture.target, capture.option, capture.shift);
        this.deps.setRulesText(after);
        this.deps.rerender();
        this.deps.log(capture.reset ? `reset swaps for ${capture.target}` : `swap ${capture.target} ${capture.shift ? '+shift ' : ''}=> ${capture.option}`);
        this.pending.clear();
        return true;
    }

    private append(ctx: MinimenuContext, option: string, capture: PendingCapture): void {
        const index = ctx.appendEntry(option);
        if (index !== -1) {
            this.pending.set(index, capture);
            this.lastLabels.push(option);
        }
    }
}
