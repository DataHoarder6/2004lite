// Attack clock: ngraves95/attacktimer tick state machine ported to server
// attackrate periods (ADR-0011, docs/plugins-spec.md §4). Pure + deterministic:
// the plugin feeds it facade events, unit tests drive it directly. onTick
// means one SERVER tick (600ms facade `tick`), never a client frame.
//
// Server model (Content skill_combat, all in ticks of 0.6s):
// - melee: next attack at now + oc_param(weapon, attackrate), 4 unarmed.
// - ranged: weapon rate, -1 on rapid style.
// - magic: fixed 5.
// - eating normal food: %action_delay += 3, but only when the next attack is
//   still pending (consume.rs2 adds to the live action_delay).

export type AttackState = 'NOT_ATTACKING' | 'DELAYED_FIRST_TICK' | 'DELAYED';

/** Speed-changing rule (ADR-0011): v1 ships only the rapid-style rule. */
export interface VariableSpeed {
    adjust(period: number): number;
}

/** Ranged rapid style attacks 1 tick faster (player_ranged.rs2). */
export class RapidRule implements VariableSpeed {
    constructor(private readonly rapid: boolean) {}

    adjust(period: number): number {
        return this.rapid ? Math.max(period - 1, 1) : period;
    }
}

export class AttackClock {
    private state: AttackState = 'NOT_ATTACKING';
    /** Tick of the next allowed attack; ticksLeft = max(0, nextReady - now). */
    private nextReady = 0;
    private now = 0;
    private period = 4;

    get current(): AttackState {
        return this.state;
    }

    get ticksLeft(): number {
        return Math.max(this.nextReady - this.now, 0);
    }

    setPeriod(period: number): void {
        this.period = Math.max(Math.floor(period), 1);
    }

    /** Local player gained a target: first swing lands ~1 tick later. */
    onEngage(): void {
        if (this.state === 'NOT_ATTACKING') {
            this.state = 'DELAYED_FIRST_TICK';
            this.nextReady = this.now + 1;
        }
    }

    /** Local attack animation observed: schedule the next swing. */
    onAttackAnim(): void {
        this.state = 'DELAYED';
        this.nextReady = this.now + this.period;
    }

    /**
     * Food eaten (server adds +3 to the live action_delay). Applies only
     * while a swing is pending — eating idle leaves no mark, same as the
     * server (consume.rs2).
     */
    onEat(delayTicks: number): void {
        if (this.state !== 'NOT_ATTACKING' && this.nextReady > this.now) {
            this.nextReady += Math.max(Math.floor(delayTicks), 0);
        }
    }

    onTick(): void {
        this.now++;
        if (this.state === 'DELAYED_FIRST_TICK' && this.now > this.nextReady) {
            // Engage grace: hold at 0 (about to swing) rather than idling.
        }
    }

    onDisengage(): void {
        this.state = 'NOT_ATTACKING';
    }

    onReset(): void {
        this.state = 'NOT_ATTACKING';
        this.nextReady = this.now;
    }
}
