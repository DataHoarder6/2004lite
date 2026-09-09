// Host event bus implementation. Queued by publishers, flushed by the
// cycle-end hook so plugin handlers never run mid-tick (ADR-0006).

import type { EventBus, EventKind, FacadeEvent, FacadeEventHandler } from '#api/events.js';

// The facade's typed-handler surface is plugin-facing ergonomics; internally
// every handler is stored against the full union and narrowed by kind match.
type AnyHandler = (event: FacadeEvent) => void;

function erased<K extends EventKind>(handler: FacadeEventHandler<K>): AnyHandler {
    return handler as AnyHandler;
}

export class QueuedEventBus implements EventBus {
    private queue: FacadeEvent[] = [];
    private handlers = new Map<string, Set<AnyHandler>>();
    private enabled = true;

    on<K extends EventKind>(kind: K, handler: FacadeEventHandler<K>): void {
        let set = this.handlers.get(kind);
        if (!set) {
            set = new Set();
            this.handlers.set(kind, set);
        }
        set.add(erased(handler));
    }

    off<K extends EventKind>(kind: K, handler: FacadeEventHandler<K>): void {
        this.handlers.get(kind)?.delete(erased(handler));
    }

    /** Host-side publish: queued, not delivered until flush. */
    publish(event: FacadeEvent): void {
        if (this.enabled) {
            this.queue.push(event);
        }
    }

    /** Deliver queued events to subscribers. Called once per game cycle. */
    flush(): void {
        // Handlers may subscribe/unsubscribe mid-flush; iterate a snapshot.
        while (this.queue.length > 0) {
            const batch = this.queue;
            this.queue = [];
            for (const event of batch) {
                const set = this.handlers.get(event.kind);
                if (!set) {
                    continue;
                }
                for (const handler of [...set]) {
                    try {
                        handler(event);
                    } catch (error) {
                        this.onHandlerError?.(event.kind, error);
                    }
                }
            }
        }
    }

    /** Drop all queued events and subscriptions (plugin disabled/unloaded). */
    clear(): void {
        this.queue = [];
        this.handlers.clear();
    }

    /** Temporarily stop accepting publishes (between disable and re-enable). */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.queue = [];
        }
    }

    /** Set by the host: auto-disable a plugin whose handler throws. */
    onHandlerError: ((kind: string, error: unknown) => void) | null = null;
}
