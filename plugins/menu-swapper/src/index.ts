// Menu Entry Swapper: exercises the menu mutation capability (ADR-0005,
// swap-only). Config-driven rules: promote a chosen option above another for
// NPC interactions. Classic 2004 QoL: "Bank" above "Talk-to".

import { definePlugin } from '#api/plugin.js';
import type { MenuSwapView } from '#api/plugin.js';

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            {
                key: 'enabled-rules',
                label: 'Enable swap rules',
                type: 'boolean',
                default: true
            },
            {
                key: 'promote',
                label: 'Promote option (prefix match)',
                type: 'string',
                default: 'Bank',
                description: 'Option moved to the top of the NPC menu'
            },
            {
                key: 'demote',
                label: 'Above option (prefix match)',
                type: 'string',
                default: 'Talk-to',
                description: 'The option "promote" swaps above'
            }
        ]
    });

    ctx.setMenuSwapper((view: MenuSwapView) => {
        if (!config.get<boolean>('enabled-rules')) {
            return;
        }

        const promote = config.get<string>('promote').toLowerCase();
        const demote = config.get<string>('demote').toLowerCase();
        if (!promote || !demote) {
            return;
        }

        // find the promoted entry below a demoted entry within the NPC ops
        // (client sorts priority actions last; we swap them across)
        let demoteIndex = -1;
        let promoteIndex = -1;
        for (const entry of view.entries) {
            const option = entry.option.toLowerCase();
            if (demoteIndex === -1 && option.startsWith(demote)) {
                demoteIndex = entry.index;
            } else if (promoteIndex === -1 && option.startsWith(promote) && entry.index > 0) {
                promoteIndex = entry.index;
            }
        }

        if (demoteIndex > 0 && promoteIndex > demoteIndex) {
            view.swap(promoteIndex, demoteIndex);
        }
    });

    ctx.log('menu-swapper started');
});
