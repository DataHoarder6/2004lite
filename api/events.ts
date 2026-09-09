// Facade event bus surface. Plugins subscribe; the host publishes derived
// events from cycle-end state diffs. Plugins cannot emit game events
// (ADR-0002) — the facade bus is host->plugin only.

import type { ChatMessage, Inventory, SkillSnapshot } from './types.js';

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

export type FacadeEvent = XpGainedEvent | StatChangedEvent | RunEnergyChangedEvent | InventoryChangedEvent | ChatMessageEvent | CycleEvent;

export type EventKind = FacadeEvent['kind'];

export type FacadeEventHandler<K extends EventKind = EventKind> = (event: Extract<FacadeEvent, { kind: K }>) => void;

export interface EventBus {
    on<K extends EventKind>(kind: K, handler: FacadeEventHandler<K>): void;
    off<K extends EventKind>(kind: K, handler: FacadeEventHandler<K>): void;
}
