// Menu Entry Swapper: RuneLite-parity swaps for the 2004 interaction set
// (ADR-0011). Preset toggles cover NPC/object/item/bank/shift cases; per-entry
// custom left/shift-click swaps persist as `custom-rules` text (panel-editable,
// import/export by copy-paste) and are captured in-game with shift+right-click
// (host chrome rows, never plugin-visible). Swap-only throughout (ADR-0005).

import { definePlugin } from '#api/plugin.js';
import type { MenuSwapView } from '#api/plugin.js';
import { CUSTOM_RULES_KEY } from '#api/swaprules.js';
import { applySwaps } from './rules.js';

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            { key: 'npc-bank', label: 'Bankers: Bank first', type: 'boolean', default: true },
            { key: 'npc-trade', label: 'Shops: Trade first', type: 'boolean', default: true },
            { key: 'npc-travel', label: 'Travel: sail/fare first', type: 'boolean', default: true },
            { key: 'npc-attack', label: 'NPCs: Attack first', type: 'boolean', default: false, description: 'Promotes Attack above Talk-to/Pickpocket' },
            { key: 'loc-bank', label: 'Bank booths: Bank first', type: 'boolean', default: true },
            { key: 'loc-open', label: 'Doors: Open first', type: 'boolean', default: true },
            {
                key: 'stairs-mode',
                label: 'Stairs climb mode',
                type: 'enum',
                default: 'off',
                options: ['off', 'up', 'down'],
                description: 'Left-click stairs climb up/down'
            },
            { key: 'item-eat', label: 'Food: Eat above Drop', type: 'boolean', default: true },
            { key: 'item-bury', label: 'Bones: Bury above Drop', type: 'boolean', default: true },
            { key: 'bank-shift', label: 'Shift: largest bank quantity', type: 'boolean', default: true },
            { key: 'walk-deprioritize', label: 'Shift: Walk-here to bottom', type: 'boolean', default: true },
            {
                key: CUSTOM_RULES_KEY,
                label: 'Custom swaps (target => option)',
                type: 'string',
                default: '# one rule per line, e.g. banker => bank\n# shift variant: banker +shift => talk-to',
                description: 'One rule per line (";" also separates). Shift+right-click in game to capture.'
            }
        ]
    });

    ctx.setMenuSwapper((view: MenuSwapView) => {
        applySwaps(view, {
            get: key => config.get(key),
            getRulesText: () => config.get<string>(CUSTOM_RULES_KEY)
        });
    });

    ctx.log('menu-swapper started');
});
