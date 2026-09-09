// Camera Zoom: exercises the benign client-local write (ADR-0005) — pitch
// presets via client.setCameraPitch. Client-side only, no packets.

import { definePlugin } from '#api/plugin.js';

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            {
                key: 'pitch',
                label: 'Camera pitch preset',
                type: 'number',
                default: 383,
                min: 128,
                max: 383,
                description: '128 = lowest, 383 = highest'
            },
            {
                key: 'continuous',
                label: 'Keep pitch pinned every cycle',
                type: 'boolean',
                default: false
            }
        ]
    });

    function apply(): boolean {
        const pitch = config.get<number>('pitch');
        return ctx.client.setCameraPitch(pitch);
    }

    if (config.get<boolean>('continuous')) {
        ctx.events.on('cycle', () => {
            apply();
        });
    } else {
        apply();
    }

    ctx.log('camera-zoom started');
});
