// Per-NPC attack countdowns (ADR-0011, docs/plugins-spec.md). Pure +
// deterministic: the plugin feeds facade snapshots/events, tests drive it.
//
// Tracking is damage-gated: an NPC joins only on combat evidence (it takes a
// hit while engaged, or the local player takes a hit while it faces them),
// so talking, pickpocketing and emoting at NPCs stay silent. Its own attack
// animations then resync the countdown each swing. Entries expire after a
// combat-silent window. No per-NPC config in v1.

export interface TrackedNpc {
    key: string;
    typeId: number;
    name: string;
    period: number;
    ticksLeft: number;
    lastEvidence: number;
}

export interface NpcSight {
    key: string;
    typeId: number;
    name: string;
}

/** Ticks without combat evidence before a tracked NPC expires. */
export const STALE_EVIDENCE_TICKS = 10;

export class NpcTracker {
    private readonly tracked = new Map<string, TrackedNpc>();

    /**
     * Combat evidence for an engaged NPC: add at full period, or refresh the
     * evidence stamp. Ignores NPCs outside the engaged set. Returns the entry
     * or null when ignored.
     */
    noteEvidence(sight: NpcSight, engagedKeys: Set<string>, periodOf: (typeId: number) => number, nowTick: number): TrackedNpc | null {
        if (!engagedKeys.has(sight.key)) {
            return null;
        }
        const existing = this.tracked.get(sight.key);
        if (existing) {
            existing.typeId = sight.typeId;
            existing.name = sight.name;
            existing.lastEvidence = nowTick;
            return existing;
        }
        const period = Math.max(Math.floor(periodOf(sight.typeId)), 1);
        const entry: TrackedNpc = {
            key: sight.key,
            typeId: sight.typeId,
            name: sight.name,
            period,
            ticksLeft: period,
            lastEvidence: nowTick
        };
        this.tracked.set(sight.key, entry);
        return entry;
    }

    /** Attack animation observed: restart this NPC's countdown. Tracked only. */
    onAnim(key: string): void {
        const entry = this.tracked.get(key);
        if (entry) {
            entry.ticksLeft = entry.period;
        }
    }

    /**
     * Membership refresh per server tick: drop disengaged and stale entries.
     */
    update(engagedKeys: Set<string>, nowTick: number): TrackedNpc[] {
        for (const [key, entry] of [...this.tracked]) {
            if (!engagedKeys.has(key) || nowTick - entry.lastEvidence > STALE_EVIDENCE_TICKS) {
                this.tracked.delete(key);
            }
        }
        return this.all();
    }

    onTick(): void {
        for (const entry of this.tracked.values()) {
            entry.ticksLeft = Math.max(entry.ticksLeft - 1, 0);
        }
    }

    clear(): void {
        this.tracked.clear();
    }

    all(): TrackedNpc[] {
        return [...this.tracked.values()];
    }
}
