// Inventory Value: exercises config + cache data + overlay.
// Sums carried item stack values using ObjType names from the host state.

import { definePlugin } from '#api/plugin.js';
import type { InventoryChangedEvent } from '#api/events.js';

// Build 274 has no Grand Exchange; this plugin is a config+data showcase counting
// stacks and coin totals, not an economy oracle.

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            { key: 'show-overlay', label: 'Show overlay', type: 'boolean', default: true },
            { key: 'position', label: 'Overlay position', type: 'enum', default: 'top-right', options: ['top-right', 'bottom-right'] }
        ]
    });

    let last: { count: number; id: number }[] = [];

    ctx.events.on('inventory-changed', (event: InventoryChangedEvent) => {
        last = event.inventory.items.map(item => ({ id: item.id, count: item.count }));
    });

    ctx.setOverlay({
        render({ ctx: g }) {
            if (!config.get<boolean>('show-overlay') || last.length === 0) {
                return;
            }

            let coins = 0;
            let stacks = 0;
            for (const item of last) {
                if (item.id === 0) {
                    continue;
                }
                stacks++;
                if (item.count > 1) {
                    coins += item.count;
                }
            }

            g.save();
            g.font = 'bold 12px Arial';
            g.textAlign = 'right';
            g.fillStyle = '#ffd700';
            const y = config.get<string>('position') === 'bottom-right' ? 338 - 30 : 338 + 20;
            g.fillText(`${stacks} stacks / ${coins} stack-count`, 716 - 4, y);
            g.restore();
        }
    });

    ctx.log('inventory-value started');
});
