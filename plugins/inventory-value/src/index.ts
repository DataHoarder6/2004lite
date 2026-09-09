// Inventory Value: exercises config + cache data + overlay.
// Totals carried stacks at their ObjType shop cost.

import { definePlugin } from '#api/plugin.js';
import type { InventoryChangedEvent } from '#api/events.js';
import type { InventoryItem } from '#api/types.js';

function formatCoins(value: number): string {
    return value.toLocaleString('en-GB');
}

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            { key: 'show-overlay', label: 'Show overlay', type: 'boolean', default: true },
            { key: 'position', label: 'Overlay position', type: 'enum', default: 'top-right', options: ['top-right', 'bottom-right'] }
        ]
    });

    let last: InventoryItem[] = [];

    ctx.events.on('inventory-changed', (event: InventoryChangedEvent) => {
        last = event.inventory.items;
    });

    ctx.setOverlay({
        render({ ctx: g }) {
            if (!config.get<boolean>('show-overlay') || last.length === 0) {
                return;
            }

            let total = 0;
            let stacks = 0;
            for (const item of last) {
                if (item.id <= 0 || item.count <= 0) {
                    continue;
                }
                stacks++;
                const def = ctx.client.objDef(item.id);
                total += (def?.cost ?? 0) * item.count;
            }

            g.save();
            g.font = 'bold 12px Arial';
            g.textAlign = 'right';
            g.fillStyle = '#ffd700';
            const y = config.get<string>('position') === 'bottom-right' ? 338 - 30 : 338 + 20;
            g.fillText(`${formatCoins(total)} coins (${stacks} stacks)`, 716 - 4, y);
            g.restore();
        }
    });

    ctx.log('inventory-value started');
});
