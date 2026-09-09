// Facade hotkey surface. Plugins subscribe to named keys; the host
// dispatches trusted browser keydowns (ADR-0005: observing keys is not
// synthetic input — plugins never inject keystrokes, and the bus stays
// host->plugin only like events).

export interface HotkeyEvent {
    /** KeyboardEvent.key value ('Tab', 'Escape', 'F1', ...). */
    key: string;
}

export type HotkeyHandler = (event: HotkeyEvent) => void;

export interface HotkeyBus {
    on(key: string, handler: HotkeyHandler): void;
    off(key: string, handler: HotkeyHandler): void;
}
