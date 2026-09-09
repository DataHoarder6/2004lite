import { describe, expect, it } from 'vitest';
import { QueuedEventBus } from '../../host/bus';
import type { FacadeEvent } from '#api/events.js';

function gameEvent(kind: FacadeEvent['kind']): FacadeEvent {
    switch (kind) {
        case 'cycle':
            return { kind: 'cycle', loopCycle: 1 };
        case 'run-energy-changed':
            return { kind: 'run-energy-changed', value: 100 };
        default:
            throw new Error(`unsupported in test: ${kind}`);
    }
}

describe('QueuedEventBus', () => {
    it('queues and delivers on flush, not on publish', () => {
        const bus = new QueuedEventBus();
        const seen: number[] = [];
        bus.on('cycle', e => seen.push((e as { loopCycle: number }).loopCycle));

        bus.publish({ kind: 'cycle', loopCycle: 1 });
        expect(seen).toEqual([]);

        bus.flush();
        expect(seen).toEqual([1]);
    });

    it('delivers only to matching kind handlers', () => {
        const bus = new QueuedEventBus();
        const cycles: number[] = [];
        const energy: number[] = [];
        bus.on('cycle', e => cycles.push((e as { loopCycle: number }).loopCycle));
        bus.on('run-energy-changed', e => energy.push((e as { value: number }).value));

        bus.publish(gameEvent('cycle'));
        bus.publish(gameEvent('run-energy-changed'));
        bus.flush();

        expect(cycles).toEqual([1]);
        expect(energy).toEqual([100]);
    });

    it('off removes the handler', () => {
        const bus = new QueuedEventBus();
        const seen: number[] = [];
        const handler = (e: FacadeEvent): void => {
            seen.push((e as { loopCycle: number }).loopCycle);
        };
        bus.on('cycle', handler);
        bus.off('cycle', handler);
        bus.publish(gameEvent('cycle'));
        bus.flush();
        expect(seen).toEqual([]);
    });

    it('isolates handler errors via onHandlerError and keeps flushing', () => {
        const bus = new QueuedEventBus();
        const errors: string[] = [];
        bus.onHandlerError = (kind, error) => errors.push(`${kind}:${(error as Error).message}`);
        const seen: number[] = [];

        bus.on('cycle', () => {
            throw new Error('boom');
        });
        bus.on('cycle', e => seen.push((e as { loopCycle: number }).loopCycle));

        bus.publish(gameEvent('cycle'));
        bus.flush();

        expect(errors).toEqual(['cycle:boom']);
        expect(seen).toEqual([1]);
    });

    it('setEnabled(false) drops queued events and rejects publishes', () => {
        const bus = new QueuedEventBus();
        const seen: number[] = [];
        bus.on('cycle', e => seen.push((e as { loopCycle: number }).loopCycle));
        bus.publish(gameEvent('cycle'));
        bus.setEnabled(false);
        bus.flush();
        expect(seen).toEqual([]);
        bus.publish(gameEvent('cycle'));
        bus.setEnabled(true);
        bus.flush();
        expect(seen).toEqual([]);
    });

    it('handlers subscribing during flush receive next flush only', () => {
        const bus = new QueuedEventBus();
        const order: string[] = [];
        bus.on('cycle', () => {
            order.push('first');
            bus.on('cycle', () => order.push('second'));
        });
        bus.publish(gameEvent('cycle'));
        bus.flush();
        expect(order).toEqual(['first']);
        bus.publish(gameEvent('cycle'));
        bus.flush();
        expect(order).toEqual(['first', 'first', 'second']);
    });

    it('clear drops everything', () => {
        const bus = new QueuedEventBus();
        const seen: number[] = [];
        bus.on('cycle', e => seen.push((e as { loopCycle: number }).loopCycle));
        bus.publish(gameEvent('cycle'));
        bus.clear();
        bus.flush();
        expect(seen).toEqual([]);
    });
});
