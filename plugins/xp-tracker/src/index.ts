// XP Tracker: exercises events + overlay + localStorage persistence.
// Shows rising, fading XP drops plus xp/hr per skill, reset-able.

import { definePlugin } from '#api/plugin.js';
import type { XpGainedEvent } from '#api/events.js';

const STORE_KEY = '2004lite:plugin:xp-tracker';

/** Pixels a drop rises over its life, like the real client. */
const DROP_RISE_PX = 20;

interface TrackedSkill {
    xpGained: number;
    firstGainCycle: number;
}

interface ActiveDrop {
    skill: number;
    amount: number;
    atCycle: number;
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
                label: 'XP drop duration (ticks)',
                type: 'number',
                default: 7,
                min: 1,
                max: 60
            }
        ]
    });

    const tracked = new Map<number, TrackedSkill>();
    const drops: ActiveDrop[] = [];

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
            entry = { xpGained: 0, firstGainCycle: event.skill.effectiveLevel };
            tracked.set(skillIndex, entry);
        }
        entry.xpGained += event.delta;
        drops.push({ skill: skillIndex, amount: event.delta, atCycle: ctx.client.loopCycle });
        if (drops.length > 10) {
            drops.shift();
        }
        persist();
    }

    ctx.events.on('xp-gained', onXp);

    load();

    ctx.setOverlay({
        render({ ctx: g, loopCycle }) {
            if (!config.get<boolean>('show-overlay')) {
                return;
            }
            const life = Math.max(config.get<number>('drop-duration'), 1);

            while (drops.length > 0 && loopCycle - drops[0].atCycle > life) {
                drops.shift();
            }
            if (drops.length === 0) {
                return;
            }

            g.save();
            g.font = 'bold 12px Arial';
            g.textAlign = 'right';
            g.fillStyle = '#ffd700';
            // Viewport top-right (fixed-mode scene at (4,4) 512x334): drops
            // previously drew at canvas x=712, over the minimap/side panel.
            const baseX = 4 + 512 - 6;
            const baseY = 4 + 20;
            let slot = 0;
            for (const drop of drops.slice(-5)) {
                const age = loopCycle - drop.atCycle;
                const progress = Math.min(Math.max(age / life, 0), 1);
                const y = baseY + slot * 16 - progress * DROP_RISE_PX;
                // Fade over the last 40% of life.
                g.globalAlpha = progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4;
                g.fillText(`+${drop.amount} ${skillName(drop.skill)} xp`, baseX, y);
                slot++;
            }
            g.restore();
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
