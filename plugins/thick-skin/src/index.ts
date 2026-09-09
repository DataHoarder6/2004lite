// Thick Skin: toggles the Thick Skin prayer on a hotkey (Tab by default).
// Uses the typed toggle-button action (ClientState.pressToggleButton): the
// exact TOGGLE_BUTTON packet path, no raw packets (ADR-0005).

import { definePlugin } from '#api/plugin.js';

/**
 * Thick Skin button com in the prayer tab (build 274): 5609, the first comp
 * after the prayer interface (5608), verified via the server's own
 * Component.getId('prayer:prayer_thickskin'). Prayer0 varp (83) mirrors it.
 */
const THICK_SKIN_COMID = 5609;

const ALLOWED_KEYS = ['Tab', 'Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];

export default definePlugin(ctx => {
    const config = ctx.declareConfig({
        fields: [
            {
                key: 'key',
                label: 'Toggle key',
                type: 'string',
                default: 'Tab',
                description: 'KeyboardEvent.key value. Hotkeys never fire while typing or logged out.'
            }
        ]
    });

    function currentKey(): string {
        return config.get<string>('key').trim();
    }

    const startKey = currentKey();
    if (!ALLOWED_KEYS.includes(startKey)) {
        ctx.log(`unsupported key '${startKey}' (allowed: ${ALLOWED_KEYS.join(', ')})`);
    }

    function toggle(): void {
        if (!ctx.client.ingame) {
            return;
        }
        if (!ctx.client.pressToggleButton(THICK_SKIN_COMID)) {
            ctx.log('thick skin toggle failed (bad com id?)');
        }
    }

    // One subscription per allowed key; the configured one dispatches.
    // Reads config live, so rebinding needs no reload.
    for (const key of ALLOWED_KEYS) {
        ctx.hotkeys.on(key, event => {
            if (event.key === currentKey() && ALLOWED_KEYS.includes(event.key)) {
                toggle();
            }
        });
    }

    ctx.log('thick-skin started');
});
