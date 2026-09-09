// Packet Observer: parsed upstream/downstream traffic in the browser
// console for debugging (ADR-0014, grilled design). Read-only tap: opcode
// names + sizes + small-packet hex; bulk movement passes size only. Category
// checkboxes (all ON = full firehose) + opcode-name text filter + per-second
// cap with drop counter. A structured ring is kept host-side, readable via
// window.__lite4.packets() for copy/export.

import { definePlugin } from '#api/plugin.js';
import type { ParsedPacket } from '#api/packets.js';
import { categorize, categoryKey, matchesTextFilter } from './filter.js';

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            { key: 'up-movement', label: 'Upstream: movement', type: 'boolean', default: true },
            { key: 'up-scene', label: 'Upstream: scene', type: 'boolean', default: true },
            { key: 'up-interface', label: 'Upstream: interface', type: 'boolean', default: true },
            { key: 'up-chat', label: 'Upstream: chat', type: 'boolean', default: true },
            { key: 'up-stat', label: 'Upstream: stats', type: 'boolean', default: true },
            { key: 'up-camera', label: 'Upstream: camera', type: 'boolean', default: true },
            { key: 'up-misc', label: 'Upstream: misc', type: 'boolean', default: true },
            { key: 'down-input', label: 'Downstream: input', type: 'boolean', default: true },
            { key: 'down-anticheat', label: 'Downstream: anticheat', type: 'boolean', default: true },
            { key: 'down-action', label: 'Downstream: actions', type: 'boolean', default: true },
            { key: 'down-misc', label: 'Downstream: misc', type: 'boolean', default: true },
            {
                key: 'opcode-filter',
                label: 'Opcode filter (comma substrings)',
                type: 'string',
                default: '',
                description: 'Empty = all. e.g. OBJ_* or IF_BUTTON,OPNPC2.'
            },
            {
                key: 'max-lines-per-sec',
                label: 'Console cap (lines/sec, 0 = off)',
                type: 'number',
                default: 50,
                min: 0,
                max: 1000
            },
            { key: 'show-hex', label: 'Show small-packet hex', type: 'boolean', default: true }
        ]
    });

    let windowSecond = -1;
    let windowCount = 0;
    let windowDropped = 0;

    function format(packet: ParsedPacket): string {
        const note = packet.note !== '' ? ` ${packet.note}` : '';
        return `[pkt ${packet.direction === 'upstream' ? 'up' : 'down'} ${packet.name} #${packet.opcode} size=${packet.size}${note}]`;
    }

    ctx.packets.on(packet => {
        if (!config.get<boolean>(categoryKey(packet.direction, categorize(packet.direction, packet.name)))) {
            return;
        }
        if (!matchesTextFilter(config.get<string>('opcode-filter'), packet.name)) {
            return;
        }
        const cap = config.get<number>('max-lines-per-sec');
        const second = Math.floor(Date.now() / 1000);
        if (second !== windowSecond) {
            if (windowDropped > 0) {
                console.log(`[pkt ... +${windowDropped} dropped by cap]`);
            }
            windowSecond = second;
            windowCount = 0;
            windowDropped = 0;
        }
        if (cap > 0 && windowCount >= cap) {
            windowDropped++;
            return;
        }
        windowCount++;
        console.log(format(packet));
        if (config.get<boolean>('show-hex') && packet.hex) {
            console.log(`  hex ${packet.hex}`);
        }
    });

    ctx.log('packet-observer started');
});
