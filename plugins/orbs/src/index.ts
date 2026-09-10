// Data Orbs: RuneLite-style HP/Prayer/Run readouts beside the minimap
// (researched: OSRS wiki Minimap — drain orbs with the number left of each).
// Values come straight from facade state, no new instrumentation: Hitpoints
// and Prayer read current/max off their skills (drain reduces effective
// level, server-side), Run off runEnergy (/100).
//
// v1 limits: display-only (overlays are draw-only; no click surface exists
// for run-toggle/cure), no poison/disease recolor (no facade ailment state),
// and the client's own indicators stay (removing upstream UI is out of
// scope). Positions are fixed-mode minimap geometry (build 274).

import { definePlugin } from '#api/plugin.js';
import type { ClientState } from '#api/plugin.js';

/** Canonical skill order (matches Skill.names / SKILL_NAMES). */
const HITPOINTS_INDEX = 3;
const PRAYER_INDEX = 5;

/** Fixed-mode orb column (left of the minimap at ~(550,4)), radius 12. */
const ORB_X = 548;
const ORB_R = 12;
const ORB_TOP = 46;
const ORB_GAP = 30;

interface OrbDef {
    key: 'show-hp' | 'show-prayer' | 'show-run';
    dy: number;
    fill: string;
    value: (client: ClientState) => { current: number; max: number } | null;
    textColor: (fraction: number) => string;
}

function skillValue(client: ClientState, index: number): { current: number; max: number } | null {
    const skill = client.skill(index);
    if (!skill || skill.baseLevel <= 0) {
        return null;
    }
    return { current: Math.max(skill.effectiveLevel, 0), max: skill.baseLevel };
}

const ORBS: OrbDef[] = [
    {
        key: 'show-hp',
        dy: 0,
        fill: '#c0392b',
        value: client => skillValue(client, HITPOINTS_INDEX),
        textColor: fraction => (fraction > 0.5 ? '#00ff00' : fraction > 0.25 ? '#ffff00' : '#ff4444')
    },
    {
        key: 'show-prayer',
        dy: 1,
        fill: '#3b82c4',
        value: client => skillValue(client, PRAYER_INDEX),
        textColor: () => '#ffffff'
    },
    {
        key: 'show-run',
        dy: 2,
        fill: '#e6a817',
        value: client => ({ current: Math.max(client.runEnergy, 0), max: 100 }),
        textColor: () => '#ffffff'
    }
];

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            { key: 'show-hp', label: 'Show hitpoints orb', type: 'boolean', default: true },
            { key: 'show-prayer', label: 'Show prayer orb', type: 'boolean', default: true },
            { key: 'show-run', label: 'Show run energy orb', type: 'boolean', default: true }
        ]
    });

    ctx.setOverlay({
        render({ ctx: g }) {
            if (!ctx.client.ingame) {
                return;
            }
            g.save();
            g.textAlign = 'right';
            g.font = 'bold 12px Arial';
            for (const orb of ORBS) {
                if (!config.get<boolean>(orb.key)) {
                    continue;
                }
                const reading = orb.value(ctx.client);
                if (!reading) {
                    continue;
                }
                const fraction = Math.min(Math.max(reading.current / reading.max, 0), 1);
                const y = ORB_TOP + orb.dy * ORB_GAP;
                // Number left of the orb.
                g.fillStyle = orb.textColor(fraction);
                g.fillText(String(reading.current), ORB_X - ORB_R - 4, y + 4);
                // Orb body: dark socket, bottom-up fill, thin ring.
                g.beginPath();
                g.arc(ORB_X, y, ORB_R, 0, Math.PI * 2);
                g.fillStyle = '#1a1a1a';
                g.fill();
                g.save();
                g.beginPath();
                g.arc(ORB_X, y, ORB_R - 2, 0, Math.PI * 2);
                g.clip();
                g.fillStyle = orb.fill;
                const fillTop = y + (ORB_R - 2) - (ORB_R - 2) * 2 * fraction;
                g.fillRect(ORB_X - (ORB_R - 2), fillTop, (ORB_R - 2) * 2, (ORB_R - 2) * 2);
                g.restore();
                g.beginPath();
                g.arc(ORB_X, y, ORB_R, 0, Math.PI * 2);
                g.lineWidth = 1;
                g.strokeStyle = '#888888';
                g.stroke();
            }
            g.restore();
        }
    });

    ctx.log('orbs started');
});
