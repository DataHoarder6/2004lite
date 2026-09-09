// Facade event bus surface. Plugins subscribe; the host publishes derived
// events from cycle-end state diffs. Plugins cannot emit game events
// (ADR-0002) — the facade bus is host->plugin only.

import type { ChatMessage, GroundItem, Inventory, SkillSnapshot } from './types.js';
import type { CombatEntity, Hitsplat } from './combat.js';

export interface XpGainedEvent {
    kind: 'xp-gained';
    skill: SkillSnapshot;
    delta: number;
}

export interface StatChangedEvent {
    kind: 'stat-changed';
    skill: SkillSnapshot;
}

export interface RunEnergyChangedEvent {
    kind: 'run-energy-changed';
    value: number;
}

export interface InventoryChangedEvent {
    kind: 'inventory-changed';
    inventory: Inventory;
}

export interface ChatMessageEvent {
    kind: 'chat-message';
    message: ChatMessage;
}

export interface CycleEvent {
    kind: 'cycle';
    loopCycle: number;
}

/**
 * Server-tick pulse (600ms wall-clock boundaries). Countdown state
 * (attack timers, xp drops) advances here — NOT on `cycle`, which fires
 * per client frame (~50Hz) and would run 30x fast.
 */
export interface TickEvent {
    kind: 'tick';
    loopCycle: number;
    /** Wall-clock tick index; handlers derive elapsed ticks from diffs. */
    tick: number;
}

export interface GroundItemSpawnedEvent {
    kind: 'ground-item-spawned';
    item: GroundItem;
}

export interface GroundItemDespawnedEvent {
    kind: 'ground-item-despawned';
    item: GroundItem;
}

export interface GroundItemQuantityEvent {
    kind: 'ground-item-quantity';
    item: GroundItem;
    previousQty: number;
}

export interface AnimStartedEvent {
    kind: 'anim-started';
    entity: CombatEntity;
    animId: number;
    loopCycle: number;
}

export interface HitsplatEvent {
    kind: 'hitsplat';
    entity: CombatEntity;
    hitsplat: Hitsplat;
    loopCycle: number;
}

export interface TargetChangedEvent {
    kind: 'target-changed';
    entity: CombatEntity;
    /** faced-entity key, null when the entity drops its target. */
    targetKey: string | null;
    loopCycle: number;
}

export type FacadeEvent =
    | XpGainedEvent
    | StatChangedEvent
    | RunEnergyChangedEvent
    | InventoryChangedEvent
    | ChatMessageEvent
    | CycleEvent
    | TickEvent
    | GroundItemSpawnedEvent
    | GroundItemDespawnedEvent
    | GroundItemQuantityEvent
    | AnimStartedEvent
    | HitsplatEvent
    | TargetChangedEvent;

export type EventKind = FacadeEvent['kind'];

export type FacadeEventHandler<K extends EventKind = EventKind> = (event: Extract<FacadeEvent, { kind: K }>) => void;

export interface EventBus {
    on<K extends EventKind>(kind: K, handler: FacadeEventHandler<K>): void;
    off<K extends EventKind>(kind: K, handler: FacadeEventHandler<K>): void;
}
