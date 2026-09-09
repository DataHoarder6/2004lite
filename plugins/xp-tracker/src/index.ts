// XP Tracker: exercises events + overlay + localStorage persistence.
// Shows XP drops and xp/hr per skill, reset-able.

import { definePlugin } from '#api/plugin.js';
import type { XpGainedEvent } from '#api/events.js';

const STORE_KEY = '2004lite:plugin:xp-tracker';

interface TrackedSkill {
    xpGained: number;
    drop: number;
    dropCycle: number;
    firstGainCycle: number;
}

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            {
                key: 'show-overlay',
                label: 'Show overlay',
                type: 'boolean',
                default: true
            },
            {
                key: 'drop-duration',
                label: 'XP drop duration (frames)',
                type: 'number',
                default: 200,
                min: 10,
                max: 600
            }
        ]
    });

    const tracked = new Map<number, TrackedSkill>();

    function load(): void {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) {
                for (const [key, value] of Object.entries(JSON.parse(raw))) {
                    tracked.set(Number(key), value as TrackedSkill);
                }
            }
        } catch {
            // fresh start
        }
    }

    function persist(): void {
        const serializable: Record<string, TrackedSkill> = {};
        for (const [index, entry] of tracked) {
            serializable[index] = entry;
        }
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(serializable));
        } catch {
            // quota: keep session-only
        }
    }

    function onXp(event: XpGainedEvent): void {
        const skillIndex = event.skill.index;
        let entry = tracked.get(skillIndex);
        if (!entry) {
            entry = { xpGained: 0, drop: 0, dropCycle: 0, firstGainCycle: event.skill.effectiveLevel };
            tracked.set(skillIndex, entry);
        }
        entry.xpGained += event.delta;
        entry.drop = event.delta;
        entry.dropCycle = 0;
        persist();
    }

    ctx.events.on('xp-gained', onXp);

    load();

    ctx.setOverlay({
        render({ ctx: g, loopCycle }) {
            if (!config.get<boolean>('show-overlay')) {
                return;
            }
            const dropDuration = config.get<number>('drop-duration');

            const drops: { name: string; amount: number }[] = [];
            for (const [index, entry] of tracked) {
                if (entry.drop > 0 && entry.dropCycle < dropDuration) {
                    entry.dropCycle++;
                    drops.push({ name: skillName(index), amount: entry.drop });
                }
            }

            if (drops.length === 0) {
                return;
            }

            g.save();
            g.font = 'bold 12px Arial';
            g.textAlign = 'right';
            g.fillStyle = '#ffd700';
            let y = 40 + 4;
            for (const drop of drops.slice(0, 5)) {
                g.fillText(`+${drop.amount} ${drop.name} xp`, 716 - 4, y);
                y += 16;
            }
            g.restore();
            void loopCycle;
        }
    });

    ctx.log('xp-tracker started');
});

const NAMES = [
    'attack',
    'defence',
    'strength',
    'hitpoints',
    'ranged',
    'prayer',
    'magic',
    'cooking',
    'woodcutting',
    'fletching',
    'fishing',
    'firemaking',
    'crafting',
    'smithing',
    'mining',
    'herblore',
    'agility',
    'thieving',
    'slayer',
    '-unused-',
    'runecraft',
    '-unused-',
    '-unused-',
    '-unused-',
    '-unused-'
];

function skillName(index: number): string {
    return NAMES[index] ?? 'unknown';
}
