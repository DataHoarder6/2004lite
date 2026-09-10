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

/** Thick Skin button com (prayer tab) — mirrors the thick-skin plugin. */
const THICK_SKIN_COMID = 5609;
/** prayer0 varp mirrors Thick Skin state (Component data). */
const PRAYER0_VARP = 83;
/** Run/walk select buttons (controls tab) on the option_run varp. */
const RUN_WALK_COMID = 152;
const RUN_RUN_COMID = 153;
const OPTION_RUN_VARP = 173;

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
    /** Active-state highlight (run mode on, thick skin on). */
    active: (client: ClientState) => boolean;
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
        textColor: fraction => (fraction > 0.5 ? '#00ff00' : fraction > 0.25 ? '#ffff00' : '#ff4444'),
        active: () => false
    },
    {
        key: 'show-prayer',
        dy: 1,
        fill: '#3b82c4',
        value: client => skillValue(client, PRAYER_INDEX),
        textColor: () => '#ffffff',
        active: client => client.readVarp(PRAYER0_VARP) === 1
    },
    {
        key: 'show-run',
        dy: 2,
        fill: '#e6a817',
        value: client => ({ current: Math.max(client.runEnergy, 0), max: 100 }),
        textColor: () => '#ffffff',
        active: client => client.readVarp(OPTION_RUN_VARP) === 1
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
        clicks() {
            const regions: { x: number; y: number; width: number; height: number; onClick: () => void }[] = [];
            if (!ctx.client.ingame) {
                return regions;
            }
            if (config.get<boolean>('show-run')) {
                regions.push({
                    x: ORB_X - ORB_R,
                    y: ORB_TOP + 2 * ORB_GAP - ORB_R,
                    width: ORB_R * 2,
                    height: ORB_R * 2,
                    onClick: () => {
                        const running = ctx.client.readVarp(OPTION_RUN_VARP) === 1;
                        ctx.client.pressSelectButton(running ? RUN_WALK_COMID : RUN_RUN_COMID);
                    }
                });
            }
            if (config.get<boolean>('show-prayer')) {
                regions.push({
                    x: ORB_X - ORB_R,
                    y: ORB_TOP + 1 * ORB_GAP - ORB_R,
                    width: ORB_R * 2,
                    height: ORB_R * 2,
                    onClick: () => {
                        ctx.client.pressToggleButton(THICK_SKIN_COMID);
                    }
                });
            }
            return regions;
        },
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
                g.lineWidth = orb.active(ctx.client) ? 3 : 1;
                g.strokeStyle = orb.active(ctx.client) ? '#00ff00' : '#888888';
                g.stroke();
            }
            g.restore();
        }
    });

    ctx.log('orbs started');
});
