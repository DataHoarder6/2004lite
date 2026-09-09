// Per-NPC attack countdowns (ADR-0011, docs/plugins-spec.md). Pure +
// deterministic: the plugin feeds facade snapshots/events, tests drive it.
//
// Each engaged NPC counts its server attackrate down from its last observed
// attack animation. New engagements start full (unknown phase) and sync on
// the first observed anim. No per-NPC config in v1.

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

    /** Reconcile with the currently engaged set; returns live countdowns. */
    update(visible: NpcSight[], engagedKeys: Set<string>, periodOf: (typeId: number) => number): TrackedNpc[] {
        for (const key of [...this.tracked.keys()]) {
            if (!engagedKeys.has(key)) {
                this.tracked.delete(key);
            }
        }
        for (const sight of visible) {
            if (!engagedKeys.has(sight.key)) {
                continue;
            }
            const existing = this.tracked.get(sight.key);
            if (existing) {
                existing.typeId = sight.typeId;
                existing.name = sight.name;
                continue;
            }
            const period = Math.max(Math.floor(periodOf(sight.typeId)), 1);
            this.tracked.set(sight.key, { key: sight.key, typeId: sight.typeId, name: sight.name, period, ticksLeft: period });
        }
        return this.all();
    }

    /** Attack animation observed: restart this NPC's countdown. */
    onAnim(key: string): void {
        const entry = this.tracked.get(key);
        if (entry) {
            entry.ticksLeft = entry.period;
        }
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
