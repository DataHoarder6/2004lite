// Side Tabs: hotkey side-panel switching (Esc inventory, F1 equipment,
// F2 stats by default). Client-local tab state, no packets — the same flags
// the icon row sets (ClientState.setSideTab).

import { definePlugin } from '#api/plugin.js';

/** Standard 2004 side-tab order. */
const TABS = '0 combat, 1 stats, 2 quests, 3 inventory, 4 equipment, 5 prayer, 6 magic, 7+ social';

function clampTab(value: number): number {
    return Math.min(Math.max(Math.floor(value), 0), 12);
}

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            { key: 'esc-tab', label: 'Escape opens tab', type: 'number', default: 3, min: 0, max: 12, description: TABS },
            { key: 'f1-tab', label: 'F1 opens tab', type: 'number', default: 4, min: 0, max: 12, description: TABS },
            { key: 'f2-tab', label: 'F2 opens tab', type: 'number', default: 1, min: 0, max: 12, description: TABS }
        ]
    });

    ctx.hotkeys.on('Escape', () => {
        ctx.client.setSideTab(clampTab(config.get<number>('esc-tab')));
    });
    ctx.hotkeys.on('F1', () => {
        ctx.client.setSideTab(clampTab(config.get<number>('f1-tab')));
    });
    ctx.hotkeys.on('F2', () => {
        ctx.client.setSideTab(clampTab(config.get<number>('f2-tab')));
    });

    ctx.log('side-tabs started');
});
