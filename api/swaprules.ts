// Shared menu-swap rule text (facade-pure, ADR-0011).
//
// Custom swaps persist as plain text so the settings panel doubles as the
// import/export path: one rule per line (`;` also separates for single-line
// inputs). Both the menu-swapper plugin and the host capture UX read/write
// this format — single source of truth, no divergent stores.
//
//   banker => bank            left-click Banker menus become Bank
//   banker +shift => talk-to  shift+left-click becomes Talk-to
//
// Matching is case-insensitive. Target is the full decoded target name
// ("banker", "lumbridge"); option is a verb prefix ("bank" matches "Bank").
// `#` comments and malformed lines are ignored (user input, not code).

export const MENU_SWAPPER_ID = 'menu-swapper';
export const CUSTOM_RULES_KEY = 'custom-rules';

/** Host-chrome capture rows always start with this (ASCII: 2004 font-safe). */
export const CAPTURE_PREFIX = '> ';

export interface CustomSwapRule {
    /** Lowercased decoded target name. */
    target: string;
    /** Lowercased option verb prefix. */
    option: string;
    /** False = left-click rule, true = shift-click rule. */
    shift: boolean;
}

/** Remove client color tags (`@yel@`) and trim. */
export function stripTags(option: string): string {
    return option.replace(/@[a-z]+@/g, '').trim();
}

/** "Bank Banker" -> { verb: "bank", target: "banker" } (lowercased). */
export function splitOption(option: string): { verb: string; target: string } {
    const plain = stripTags(option);
    const space = plain.indexOf(' ');
    if (space === -1) {
        return { verb: plain.toLowerCase(), target: '' };
    }
    return {
        verb: plain.slice(0, space).toLowerCase(),
        target: plain
            .slice(space + 1)
            .trim()
            .toLowerCase()
    };
}

/** True for host-owned capture rows (never game entries, never swappable). */
export function isCaptureOption(option: string): boolean {
    return stripTags(option).startsWith(CAPTURE_PREFIX);
}

export function parseCustomRules(text: string): CustomSwapRule[] {
    const rules: CustomSwapRule[] = [];
    for (const chunk of text.split(/[\n;]/)) {
        const rule = parseRuleChunk(chunk);
        if (rule && !rules.some(r => r.target === rule.target && r.shift === rule.shift)) {
            rules.push(rule);
        }
    }
    return rules;
}

/** Parse one `target[ +shift] => option` chunk; null for comments/blanks/garbage. */
export function parseRuleChunk(chunk: string): CustomSwapRule | null {
    const line = chunk.trim();
    if (line === '' || line.startsWith('#')) {
        return null;
    }
    const arrow = line.indexOf('=>');
    if (arrow === -1) {
        return null;
    }
    const left = line.slice(0, arrow).trim().toLowerCase();
    const option = line
        .slice(arrow + 2)
        .trim()
        .toLowerCase();
    if (option === '') {
        return null;
    }
    const shift = left.endsWith('+shift');
    const target = (shift ? left.slice(0, -'+shift'.length) : left).trim();
    if (target === '' || /[^a-z0-9 ' _-]/.test(target)) {
        return null;
    }
    if (/[^a-z-]/.test(option)) {
        return null;
    }
    return { target, option, shift };
}

export function serializeCustomRules(rules: CustomSwapRule[]): string {
    return rules.map(r => `${r.target}${r.shift ? ' +shift' : ''} => ${r.option}`).join('\n');
}

/**
 * Line/chunk surgery on the rule text: replace the first (target, shift)
 * chunk in place, drop later duplicates; null replacement deletes.
 * Comments, blanks, and untouched lines stay byte-identical.
 */
function transformRuleText(text: string, target: string, shift: boolean, replacement: string | null): string {
    const key = target.trim().toLowerCase();
    const outLines: string[] = [];
    let inserted = replacement === null;
    for (const rawLine of text.split('\n')) {
        if (rawLine.trim().startsWith('#')) {
            outLines.push(rawLine);
            continue;
        }
        const chunks = rawLine.split(';');
        let touched = false;
        const kept: string[] = [];
        for (const chunk of chunks) {
            const rule = parseRuleChunk(chunk);
            if (rule && rule.target === key && rule.shift === shift) {
                touched = true;
                if (!inserted && replacement !== null) {
                    kept.push(replacement);
                    inserted = true;
                }
            } else {
                kept.push(chunk);
            }
        }
        if (touched) {
            const normalized = kept.map(c => c.trim()).filter(c => c !== '');
            if (normalized.length > 0) {
                outLines.push(normalized.join('; '));
            }
        } else {
            outLines.push(rawLine);
        }
    }
    if (!inserted && replacement !== null) {
        if (outLines.length === 1 && outLines[0].trim() === '') {
            outLines.length = 0;
        }
        outLines.push(replacement);
    }
    return outLines.join('\n');
}

/**
 * Insert or replace the (target, shift) line; empty option deletes it
 * (capture Reset). Unrelated lines keep their text untouched.
 */
export function upsertCustomRule(text: string, target: string, option: string, shift: boolean): string {
    const key = target.trim().toLowerCase();
    const value = option.trim().toLowerCase();
    const replacement = value === '' ? null : `${key}${shift ? ' +shift' : ''} => ${value}`;
    return transformRuleText(text, key, shift, replacement);
}

/** Delete every rule (left + shift) for a target (capture Reset). */
export function removeCustomRules(text: string, target: string): string {
    const key = target.trim().toLowerCase();
    return transformRuleText(transformRuleText(text, key, false, null), key, true, null);
}
