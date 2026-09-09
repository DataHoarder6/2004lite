// Ground-items list matching: RuneLite ItemList/ItemThreshold semantics.
// Comma-separated entries, `*` wildcard, exact match, or quantity guard
// (`Coins>100`, `Shark<5`). Case-insensitive, full-name anchored.

export interface ThresholdRule {
    /** Lowercased display pattern (wildcards kept). */
    pattern: string;
    regex: RegExp;
    /** Minimum qty (exclusive, `>` form) or null. */
    over: number | null;
    /** Maximum qty (exclusive, `<` form) or null. */
    under: number | null;
}

function toRegex(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
}

export function parseList(raw: string): ThresholdRule[] {
    const rules: ThresholdRule[] = [];
    for (const part of raw.split(',')) {
        const entry = part.trim();
        if (!entry) {
            continue;
        }
        const cmp = entry.match(/^(.*?)\s*([<>])\s*(\d+)\s*$/);
        if (cmp) {
            rules.push({
                pattern: cmp[1].trim().toLowerCase(),
                regex: toRegex(cmp[1].trim()),
                over: cmp[2] === '>' ? Number(cmp[3]) : null,
                under: cmp[2] === '<' ? Number(cmp[3]) : null
            });
        } else {
            rules.push({ pattern: entry.toLowerCase(), regex: toRegex(entry), over: null, under: null });
        }
    }
    return rules;
}

export function matchList(rules: ThresholdRule[], name: string, qty: number): boolean {
    const label = name.toLowerCase();
    for (const rule of rules) {
        if (!rule.regex.test(label)) {
            continue;
        }
        if (rule.over !== null && qty <= rule.over) {
            continue;
        }
        if (rule.under !== null && qty >= rule.under) {
            continue;
        }
        return true;
    }
    return false;
}

/** RuneLite QuantityFormatter.quantityToStackSize style: 12.3K, 4.5M. */
export function formatStack(value: number): string {
    if (value < 10000) {
        return value.toLocaleString('en-GB');
    }
    if (value < 10000000) {
        return `${trim(value / 1000)}K`;
    }
    return `${trim(value / 1000000)}M`;
}

function trim(value: number): string {
    const rounded = Math.floor(value * 10) / 10;
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}
