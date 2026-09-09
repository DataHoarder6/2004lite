// Host state differ: derives facade events from consecutive cycle-end state
// snapshots. Poll-diff, not packet taps — fewer upstream edits, and it can't
// desync from the client's own post-processing (ADR-0001 rationale).

import type { HostChatLine, HostClientState, HostCombatEntity } from './hooks.js';
import type { FacadeEvent } from '#api/events.js';
import { SKILL_NAMES, SKILL_USED } from './skills.js';
import type { ChatMessage, ChatType, Inventory, InventoryItem, SkillSnapshot } from '#api/types.js';
import type { CombatEntity } from '#api/combat.js';

const CHAT_WINDOW = 10;

/** Client chat-type code -> facade ChatType. */
const CHAT_TYPE_MAP: Record<number, ChatType> = {
    0: 'game',
    1: 'player',
    2: 'player',
    3: 'private-in',
    4: 'trade-request',
    5: 'private-out',
    6: 'private-out',
    7: 'private-in',
    8: 'duel-request'
};

function toChatMessage(line: HostChatLine): ChatMessage {
    return {
        type: CHAT_TYPE_MAP[line.type] ?? 'other',
        text: line.text,
        sender: line.sender,
        cycle: line.cycle
    };
}

export class StateDiffer {
    private lastXp: Int32Array | null = null;
    private lastLevels: Int32Array | null = null;
    private lastRunEnergy: number | null = null;
    private lastInventories = new Map<number, string>();
    private lastChatHead: string | null = null;
    private lastChatWindow: ChatMessage[] = [];
    private watchedInventories = new Set<number>();
    private lastEntities = new Map<string, { primaryAnim: number; faceEntity: number; hitCycle: number }>();

    snapshot(state: HostClientState): FacadeEvent[] {
        const events: FacadeEvent[] = [];

        if (!state.ingame) {
            this.reset();
            return events;
        }

        // XP + level diffs
        if (this.lastXp && this.lastXp.length === state.statXP.length) {
            for (let i = 0; i < state.statXP.length; i++) {
                if (!SKILL_USED[i]) {
                    continue;
                }
                const skill = toSkill(i, state);
                if (state.statXP[i] !== this.lastXp[i] && state.statXP[i] > 0) {
                    events.push({ kind: 'xp-gained', skill, delta: state.statXP[i] - this.lastXp[i] });
                }
                if (state.statEffectiveLevel[i] !== this.lastLevels![i]) {
                    events.push({ kind: 'stat-changed', skill });
                }
            }
        } else if (state.statXP.some(xp => xp > 0)) {
            // first in-game snapshot with real stats: baseline, no diffs
            for (let i = 0; i < state.statXP.length; i++) {
                if (SKILL_USED[i] && state.statXP[i] > 0) {
                    events.push({ kind: 'stat-changed', skill: toSkill(i, state) });
                }
            }
        }

        if (this.lastRunEnergy !== null && state.runEnergy !== this.lastRunEnergy) {
            events.push({ kind: 'run-energy-changed', value: state.runEnergy });
        }

        events.push(...this.diffChat(state.chat));
        events.push(...this.diffInventories(state));
        events.push(...this.diffEntities(state));

        this.lastXp = state.statXP.slice();
        this.lastLevels = state.statEffectiveLevel.slice();
        this.lastRunEnergy = state.runEnergy;

        return events;
    }

    // Chat ring: the client unshifts new lines to index 0; ring entries beyond
    // the newest don't move identity. Diff positionally — emit the leading
    // lines that are new since the last snapshot, oldest first.
    private diffChat(lines: HostChatLine[]): FacadeEvent[] {
        const chat = lines.slice(0, CHAT_WINDOW).map(toChatMessage);
        const identity = (m: ChatMessage): string => `${m.type}|${m.sender}|${m.text}`;

        const headId = chat.length > 0 ? identity(chat[0]) : null;
        const events: FacadeEvent[] = [];

        if (headId === null) {
            // nothing visible: keep the window so overlap math stays valid
            this.lastChatWindow = chat;
            return events;
        }

        if (this.lastChatHead === null) {
            // no history: everything currently visible is new
            for (let i = chat.length - 1; i >= 0; i--) {
                events.push({ kind: 'chat-message', message: chat[i] });
            }
        } else if (headId !== this.lastChatHead) {
            // find how many leading lines are new: scan until a line matches
            // the old window positionally shifted by that count
            let newCount = 0;
            while (newCount < chat.length) {
                const prev = this.lastChatWindow[newCount];
                const cur = chat[newCount];
                if (prev && cur && identity(prev) === identity(cur)) {
                    break;
                }
                newCount++;
            }
            // overlap window miss (more than CHAT_WINDOW new lines, or ring
            // churn): emit just the visible head — better than nothing, capped.
            if (newCount >= chat.length) {
                newCount = chat.length;
            }
            for (let i = newCount - 1; i >= 0; i--) {
                events.push({ kind: 'chat-message', message: chat[i] });
            }
        }

        this.lastChatHead = headId;
        this.lastChatWindow = chat;
        return events;
    }

    /** Plugins declare inventories to watch; differ emits inventory-changed. */
    watchInventory(comId: number): void {
        this.watchedInventories.add(comId);
    }
    private diffInventories(state: HostClientState): FacadeEvent[] {
        const events: FacadeEvent[] = [];
        for (const comId of this.watchedInventories) {
            const raw = state.readInventory(comId);
            if (!raw) {
                continue;
            }
            const items: InventoryItem[] = [];
            for (let slot = 0; slot < raw.ids.length; slot++) {
                items.push({ slot, id: raw.ids[slot], count: raw.counts[slot] });
            }
            const signature = items.map(it => `${it.id}:${it.count}`).join(',');
            if (signature !== this.lastInventories.get(comId)) {
                this.lastInventories.set(comId, signature);
                const inventory: Inventory = { comId, items };
                events.push({ kind: 'inventory-changed', inventory });
            }
        }
        return events;
    }

    /**
     * Combat diff: anim starts, new hitsplats, and facing-target changes per
     * entity. New entities baseline silently (no burst on login/area load).
     */
    private diffEntities(state: HostClientState): FacadeEvent[] {
        const events: FacadeEvent[] = [];
        const seen = new Set<string>();
        for (const raw of state.entities) {
            seen.add(raw.key);
            const entity: CombatEntity = {
                key: raw.key,
                kind: raw.kind,
                slot: raw.slot,
                typeId: raw.typeId,
                name: raw.name,
                health: raw.health,
                totalHealth: raw.totalHealth,
                primaryAnim: raw.primaryAnim,
                faceEntity: raw.faceEntity,
                combatCycle: raw.combatCycle,
                x: raw.x,
                z: raw.z,
                height: raw.height
            };
            const prev = this.lastEntities.get(raw.key);
            if (!prev) {
                this.lastEntities.set(raw.key, { primaryAnim: raw.primaryAnim, faceEntity: raw.faceEntity, hitCycle: maxHitCycle(raw) });
                continue;
            }
            if (raw.primaryAnim !== prev.primaryAnim && raw.primaryAnim !== -1) {
                events.push({ kind: 'anim-started', entity, animId: raw.primaryAnim, loopCycle: state.loopCycle });
            }
            for (const hit of raw.hitsplats) {
                if (hit.cycle > prev.hitCycle) {
                    events.push({ kind: 'hitsplat', entity, hitsplat: { type: hit.type, value: hit.value, cycle: hit.cycle }, loopCycle: state.loopCycle });
                }
            }
            if (raw.faceEntity !== prev.faceEntity) {
                events.push({ kind: 'target-changed', entity, targetKey: faceEntityKey(raw.faceEntity), loopCycle: state.loopCycle });
            }
            this.lastEntities.set(raw.key, { primaryAnim: raw.primaryAnim, faceEntity: raw.faceEntity, hitCycle: Math.max(prev.hitCycle, maxHitCycle(raw)) });
        }
        for (const key of [...this.lastEntities.keys()]) {
            if (!seen.has(key)) {
                this.lastEntities.delete(key);
            }
        }
        return events;
    }

    reset(): void {
        this.lastXp = null;
        this.lastLevels = null;
        this.lastRunEnergy = null;
        this.lastInventories.clear();
        this.lastChatHead = null;
        this.lastChatWindow = [];
        this.lastEntities.clear();
    }
}

function toSkill(index: number, state: HostClientState): SkillSnapshot {
    return {
        index,
        name: SKILL_NAMES[index],
        xp: state.statXP[index],
        baseLevel: state.statBaseLevel[index],
        effectiveLevel: state.statEffectiveLevel[index]
    };
}

/** Client faceEntity encoding: <32768 = npc slot, else player slot + 32768. */
function faceEntityKey(faceEntity: number): string | null {
    if (faceEntity === -1) {
        return null;
    }
    if (faceEntity < 32768) {
        return `npc:${faceEntity}`;
    }
    return `player:${faceEntity - 32768}`;
}

function maxHitCycle(raw: HostCombatEntity): number {
    let max = -1;
    for (const hit of raw.hitsplats) {
        if (hit.cycle > max) {
            max = hit.cycle;
        }
    }
    return max;
}

export { SKILL_NAMES, SKILL_USED };
export type { ChatType };
