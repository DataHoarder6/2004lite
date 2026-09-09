// Ground Items: RuneLite grounditems port (adapted, ADR-0011).
// World-anchored labels via ClientState.projectTile (getOverlayPos math),
// HA/LA prices derived from shop cost (CONTEXT.md), despawn countdown as a
// client estimate over the standard 200-tick loot window (ADR-0012).
// Out of scope for v1: lootbeam, notify, hotkey (no facade subsystem).

import { definePlugin } from '#api/plugin.js';
import type { MenuSwapView } from '#api/plugin.js';
import type { GroundItem } from '#api/types.js';
import { formatStack, matchList, parseList } from './match.js';
import { remainingMs, remainingTicks, windowFractionLeft } from './despawn.js';

// RuneLite GroundItemsConfig defaults.
const COLOR_DEFAULT = '#ffffff';
const COLOR_HIGHLIGHTED = '#aa00ff';
const COLOR_HIDDEN = '#808080';
const COLOR_LOW = '#66b2ff';
const COLOR_MEDIUM = '#99ff99';
const COLOR_HIGH = '#ff9600';
const COLOR_INSANE = '#ff66b2';
const COLOR_TIMER = '#ffff00';

// Server rules mirror (ADR-0012): durations run from spawn; see despawn.ts.
const STRING_GAP = 15;
const LIFT = 40;

// Fixed-mode viewport (Client.gameDraw: scene at (4,4) 512x334, side panel
// from x=516, chat from y=338). The game repaints only the viewport every
// frame — overlay pixels over side/chat panels smear until those panels
// repaint, so world-anchored drawing stays clipped inside.
const VIEW_X = 4;
const VIEW_Y = 4;
const VIEW_W = 512;
const VIEW_H = 334;

type PriceMode = 'off' | 'high' | 'low' | 'both';
type ValueMode = 'high' | 'low' | 'highest';
type TimerMode = 'off' | 'seconds' | 'ticks' | 'pie';

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            { key: 'highlight-list', label: 'Highlighted items', type: 'string', default: '', description: 'Comma list, * wildcard, qty guard like Coins>100' },
            { key: 'hide-list', label: 'Hidden items', type: 'string', default: 'Vial, Ashes, Coins, Bones, Bucket, Jug, Seaweed' },
            { key: 'show-highlighted-only', label: 'Show highlighted only', type: 'boolean', default: false },
            { key: 'price-display', label: 'Price display', type: 'enum', default: 'both', options: ['off', 'high', 'low', 'both'] },
            { key: 'value-mode', label: 'Value calculation', type: 'enum', default: 'highest', options: ['high', 'low', 'highest'] },
            { key: 'hide-under-value', label: 'Hide under value', type: 'number', default: 0, min: 0 },
            { key: 'low-price', label: 'Low value threshold', type: 'number', default: 20000, min: 0 },
            { key: 'medium-price', label: 'Medium value threshold', type: 'number', default: 100000, min: 0 },
            { key: 'high-price', label: 'High value threshold', type: 'number', default: 1000000, min: 0 },
            { key: 'insane-price', label: 'Insane value threshold', type: 'number', default: 10000000, min: 0 },
            { key: 'highlight-tiles', label: 'Highlight tiles', type: 'boolean', default: false },
            { key: 'menu-highlight', label: 'Promote valuable takes in menu', type: 'boolean', default: true },
            { key: 'despawn-timer', label: 'Despawn timer', type: 'enum', default: 'off', options: ['off', 'seconds', 'ticks', 'pie'] },
            { key: 'text-outline', label: 'Text outline', type: 'boolean', default: true }
        ]
    });

    // Wall-clock spawn per ground key (event-driven; immune to client
    // cycle-rate drift). Reset on quantity merge, mirroring the server
    // lifecycle reset (Engine-TS World.addObj). Reveal-origin stacks count
    // their shorter public-phase window (despawn.ts).
    const spawnWall = new Map<string, { at: number; revealed: boolean }>();
    ctx.events.on('ground-item-spawned', event => {
        spawnWall.set(event.item.key, { at: Date.now(), revealed: event.item.revealed });
    });
    ctx.events.on('ground-item-quantity', event => {
        spawnWall.set(event.item.key, { at: Date.now(), revealed: event.item.revealed });
    });
    ctx.events.on('ground-item-despawned', event => {
        spawnWall.delete(event.item.key);
    });

    function unitValue(item: GroundItem): number {
        const mode = config.get<string>('value-mode') as ValueMode;
        if (mode === 'high') {
            return item.highAlch;
        }
        if (mode === 'low') {
            return item.lowAlch;
        }
        return Math.max(item.highAlch, item.lowAlch);
    }

    function totalValue(item: GroundItem): number {
        return unitValue(item) * Math.max(item.qty, 1);
    }

    function tierColor(total: number): string | null {
        if (total >= config.get<number>('insane-price')) {
            return COLOR_INSANE;
        }
        if (total >= config.get<number>('high-price')) {
            return COLOR_HIGH;
        }
        if (total >= config.get<number>('medium-price')) {
            return COLOR_MEDIUM;
        }
        if (total >= config.get<number>('low-price')) {
            return COLOR_LOW;
        }
        return null;
    }

    interface Row {
        item: GroundItem;
        highlighted: boolean;
        hidden: boolean;
        color: string;
        total: number;
    }

    function visibleRows(): Row[] {
        const highlight = parseList(config.get<string>('highlight-list'));
        const hide = parseList(config.get<string>('hide-list'));
        const onlyHighlighted = config.get<boolean>('show-highlighted-only');
        const hideUnder = config.get<number>('hide-under-value');
        const rows: Row[] = [];
        for (const item of ctx.client.groundItems()) {
            const highlighted = matchList(highlight, item.name, item.qty);
            const hidden = !highlighted && matchList(hide, item.name, item.qty);
            if (onlyHighlighted && !highlighted) {
                continue;
            }
            const total = totalValue(item);
            if (!highlighted && total < hideUnder) {
                continue;
            }
            rows.push({ item, highlighted, hidden, color: highlighted ? COLOR_HIGHLIGHTED : (tierColor(total) ?? (hidden ? COLOR_HIDDEN : COLOR_DEFAULT)), total });
        }
        rows.sort((a, b) => b.total - a.total);
        return rows;
    }

    function priceSuffix(item: GroundItem): string {
        const mode = config.get<string>('price-display') as PriceMode;
        if (mode === 'off') {
            return '';
        }
        const ha = formatStack(item.highAlch * Math.max(item.qty, 1));
        const la = formatStack(item.lowAlch * Math.max(item.qty, 1));
        if (mode === 'high') {
            return ` (HA: ${ha})`;
        }
        if (mode === 'low') {
            return ` (LA: ${la})`;
        }
        return ` (HA: ${ha} / LA: ${la})`;
    }

    function spawnRecord(key: string): { at: number; revealed: boolean } | null {
        const record = spawnWall.get(key);
        if (record) {
            return record;
        }
        // Present before plugin load (or missed event): assume a fresh
        // private stack rather than a blank timer.
        return { at: Date.now(), revealed: false };
    }

    function timerSuffix(key: string): string {
        const mode = config.get<string>('despawn-timer') as TimerMode;
        if (mode === 'off' || mode === 'pie') {
            return '';
        }
        const record = spawnRecord(key);
        if (!record) {
            return '';
        }
        const remaining = remainingMs(record.at, Date.now(), record.revealed);
        if (remaining <= 0) {
            return '';
        }
        if (mode === 'seconds') {
            return ` - ${(remaining / 1000).toFixed(1)}`;
        }
        return ` - ${remainingTicks(record.at, Date.now(), record.revealed)}`;
    }

    function timerFraction(key: string): number | null {
        const record = spawnWall.get(key);
        if (!record) {
            return null;
        }
        return windowFractionLeft(record.at, Date.now(), record.revealed);
    }

    ctx.setOverlay({
        render({ ctx: g }) {
            const rows = visibleRows();
            if (rows.length === 0) {
                return;
            }
            const outline = config.get<boolean>('text-outline');
            const timerMode = config.get<string>('despawn-timer') as TimerMode;
            const tiles = config.get<boolean>('highlight-tiles');
            const stacked = new Map<string, number>();
            g.save();
            g.font = '12px Arial';
            g.textAlign = 'center';
            // World-anchored drawing stays inside the repainted viewport
            // (see VIEW_*): outside it overlay pixels smear over static UI.
            g.beginPath();
            g.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
            g.clip();
            for (const row of rows) {
                const { item } = row;
                const tileKey = `${item.level}/${item.tileX}/${item.tileZ}`;
                const point = ctx.client.projectTile(item.tileX, item.tileZ, item.level, LIFT);
                if (!point) {
                    continue;
                }
                const offset = stacked.get(tileKey) ?? 0;
                stacked.set(tileKey, offset + 1);
                const y = point.y - STRING_GAP * offset;
                const label = `${item.name}${item.qty > 1 ? ` (${formatStack(item.qty)})` : ''}${priceSuffix(item)}${timerSuffix(item.key)}`;
                if (tiles) {
                    // Marker sits on the ground (height 0), not at the
                    // elevated label point — one projection per tile.
                    const ground = ctx.client.projectTile(item.tileX, item.tileZ, item.level, 0);
                    if (ground) {
                        g.strokeStyle = row.color;
                        g.lineWidth = 1;
                        g.beginPath();
                        g.moveTo(ground.x, ground.y + 4);
                        g.lineTo(ground.x + 6, ground.y);
                        g.lineTo(ground.x, ground.y - 4);
                        g.lineTo(ground.x - 6, ground.y);
                        g.closePath();
                        g.stroke();
                    }
                }
                if (timerMode === 'pie') {
                    const fraction = timerFraction(item.key);
                    if (fraction !== null) {
                        g.fillStyle = 'rgba(0,0,0,0.6)';
                        g.beginPath();
                        g.arc(point.x - 12, y - 4, 5, 0, Math.PI * 2);
                        g.fill();
                        g.fillStyle = COLOR_TIMER;
                        g.beginPath();
                        g.moveTo(point.x - 12, y - 4);
                        g.arc(point.x - 12, y - 4, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fraction);
                        g.closePath();
                        g.fill();
                    }
                }
                if (outline) {
                    g.lineWidth = 3;
                    g.strokeStyle = '#000000';
                    g.strokeText(label, point.x, y);
                }
                g.fillStyle = row.color;
                g.fillText(label, point.x, y);
            }
            g.restore();
        }
    });

    // Swap-only menu highlight (ADR-0005): promote Take entries for
    // highlighted or high-tier ground items above other Take entries.
    ctx.setMenuSwapper((view: MenuSwapView) => {
        if (!config.get<boolean>('menu-highlight')) {
            return;
        }
        const highlight = parseList(config.get<string>('highlight-list'));
        const wanted = new Set<string>();
        for (const item of ctx.client.groundItems()) {
            if (matchList(highlight, item.name, item.qty) || (tierColor(totalValue(item)) !== null && tierColor(totalValue(item)) !== COLOR_LOW)) {
                wanted.add(item.name.toLowerCase());
            }
        }
        if (wanted.size === 0) {
            return;
        }
        const takes = view.entries.filter(e => e.option.toLowerCase().startsWith('take'));
        if (takes.length < 2) {
            return;
        }
        let target = takes[0].index;
        for (const entry of takes) {
            const name = entry.option.slice(4).trim().toLowerCase();
            if ([...wanted].some(w => name.includes(w) || w.includes(name))) {
                if (entry.index !== target) {
                    view.swap(entry.index, target);
                }
                target++;
                if (target > takes[takes.length - 1].index) {
                    break;
                }
            }
        }
    });

    ctx.log('ground-items started');
});
