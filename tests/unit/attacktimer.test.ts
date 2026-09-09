// Attack clock: ngraves95 state machine on server attackrate periods.

import { describe, expect, it } from 'vitest';

import { AttackClock, RapidRule } from '../../plugins/attack-timer/src/clock.js';

describe('RapidRule', () => {
    it('subtracts one tick on rapid, floors at one', () => {
        expect(new RapidRule(true).adjust(4)).toBe(3);
        expect(new RapidRule(true).adjust(1)).toBe(1);
        expect(new RapidRule(false).adjust(4)).toBe(4);
    });
});

describe('AttackClock', () => {
    it('engages to first-tick, then runs the weapon period', () => {
        const clock = new AttackClock();
        clock.setPeriod(4);
        expect(clock.current).toBe('NOT_ATTACKING');
        clock.onEngage();
        expect(clock.current).toBe('DELAYED_FIRST_TICK');
        expect(clock.ticksLeft).toBe(1);
        clock.onAttackAnim();
        expect(clock.current).toBe('DELAYED');
        expect(clock.ticksLeft).toBe(4);
        clock.onTick();
        clock.onTick();
        expect(clock.ticksLeft).toBe(2);
    });

    it('floors at zero and re-arms on the next swing', () => {
        const clock = new AttackClock();
        clock.setPeriod(3);
        clock.onEngage();
        clock.onAttackAnim();
        for (let i = 0; i < 10; i++) {
            clock.onTick();
        }
        expect(clock.ticksLeft).toBe(0);
        clock.onAttackAnim();
        expect(clock.ticksLeft).toBe(3);
    });

    it('extends a pending swing on eat, ignores eats while idle', () => {
        const clock = new AttackClock();
        clock.setPeriod(4);
        clock.onEat(3);
        expect(clock.ticksLeft).toBe(0);
        clock.onEngage();
        clock.onAttackAnim();
        clock.onEat(3);
        expect(clock.ticksLeft).toBe(7);
    });

    it('idles on disengage and reset', () => {
        const clock = new AttackClock();
        clock.onEngage();
        clock.onDisengage();
        expect(clock.current).toBe('NOT_ATTACKING');
        clock.onEngage();
        clock.onReset();
        expect(clock.current).toBe('NOT_ATTACKING');
        expect(clock.ticksLeft).toBe(0);
    });
});
