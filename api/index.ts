// 2004lite facade — the versioned surface plugins code against (ADR-0002).
// Breaking changes here require a facade version bump.

export const FACADE_VERSION = '0.2.0';
export const TARGET_CLIENT_BUILD = 274;

export * from './types.js';
export * from './combat.js';
export * from './swaprules.js';
export * from './events.js';
export * from './hotkeys.js';
export * from './config.js';
export * from './overlay.js';
export * from './plugin.js';
