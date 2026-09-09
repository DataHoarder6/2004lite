// Per-NPC attack countdowns (ADR-0011, docs/plugins-spec.md). Pure +
// deterministic: the plugin feeds facade snapshots/events, tests drive it.
//
// Tracking is damage-gated: an NPC joins only on combat evidence (it takes a
// hit while engaged, or the local player takes a hit while it faces them),
// so talking, pickpocketing and emoting at NPCs stay silent. Its own attack
// animations then resync the countdown each swing. Entries persist while the
// engagement relation holds — kiting/running keeps the fight alive even with
// no fresh damage — and drop when it breaks. No per-NPC config in v1.

export interface TrackedNpc {
    key: string;
    typeId: number;
    name: string;
    period: number;
    ticksLeft: number;
}

export interface NpcSight {
    key: string;
    typeId: number;
    name: string;
}

export class NpcTracker {
    private readonly tracked = new Map<string, TrackedNpc>();

    /**
     * Combat evidence for an engaged NPC: add at full period, or refresh.
     * Ignores NPCs outside the engaged set. Returns the entry or null when
     * ignored.
     */
    noteEvidence(sight: NpcSight, engagedKeys: Set<string>, periodOf: (typeId: number) => number): TrackedNpc | null {
        if (!engagedKeys.has(sight.key)) {
            return null;
        }
        const existing = this.tracked.get(sight.key);
        if (existing) {
            existing.typeId = sight.typeId;
            existing.name = sight.name;
            return existing;
        }
        const period = Math.max(Math.floor(periodOf(sight.typeId)), 1);
        const entry: TrackedNpc = { key: sight.key, typeId: sight.typeId, name: sight.name, period, ticksLeft: period };
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

    /** Membership refresh per server tick: drop entries whose relation broke. */
    update(engagedKeys: Set<string>): TrackedNpc[] {
        for (const key of [...this.tracked.keys()]) {
            if (!engagedKeys.has(key)) {
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
