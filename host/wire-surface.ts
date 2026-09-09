// Canonical cross-boundary surface: every property name that crosses the
// client.js <-> plugin.js bundle boundary (facade context, events, overlays,
// config, menu views, manifests, __lite4 debug handle).
//
// Plugin artifacts are separate ESM bundles (minified by Bun, which does not
// mangle properties). The client bundle IS property-mangled by terser. Any
// name on this list that terser renames breaks plugins at runtime with no
// type error — so bundle.ts reserves all of them, and check-wire-surface.ts
// fails the install if any is missing from out/client.js.
//
// Rule for contributors: adding a property to any api/*.ts interface that a
// plugin (not just the host) touches? Add the name here.

export const WIRE_SURFACE: string[] = [
    // PluginManifest + index entries: host reads these off fetch() JSON whose
    // keys are never mangled (passthrough fields like repository/commit need
    // no reservation — same object identity crosses the boundary).
    'name',
    'version',
    'entry',
    'facade',
    'targetClientBuild',

    // PluginContext
    'manifest',
    'events',
    'config',
    'client',
    'declareConfig',
    'setOverlay',
    'setMenuSwapper',
    'log',

    // Plugin lifecycle
    'start',
    'stop',

    // EventBus (host-created, plugin-subscribed)
    'on',
    'off',

    // ClientState
    'loopCycle',
    'skill',
    'skills',
    'runEnergy',
    'mapPosition',
    'readInventory',
    'readObjDef',
    'objDef',
    'recentChat',
    'cameraPitch',
    'setCameraPitch',
    'combatEntities',
    'localPlayer',
    'worldToScreen',

    // CombatEntity
    'key',
    'typeId',
    'health',
    'totalHealth',
    'primaryAnim',
    'faceEntity',
    'combatCycle',
    'x',
    'z',
    'y',
    'height',

    // Combat events
    'entity',
    'animId',
    'hitsplat',
    'targetKey',

    // MenuSwapView + entries
    'entries',
    'swap',
    'isShiftDown',
    'index',
    'option',
    'action',
    'paramA',
    'paramB',
    'paramC',
    'targetKind',
    'targetName',
    'isPriority',

    // Facade events
    'kind',
    'skill',
    'delta',
    'value',
    'inventory',
    'message',

    // Value types
    'xp',
    'baseLevel',
    'effectiveLevel',
    'tileX',
    'tileZ',
    'slot',
    'count',
    'cost',
    'comId',
    'items',
    'text',
    'sender',
    'cycle',

    // Overlay
    'ctx',
    'width',
    'height',
    'render',

    // Config schema + store
    'pluginId',
    'fields',
    'key',
    'label',
    'description',
    'default',
    'min',
    'max',
    'options',
    'get',
    'set',
    'all',

    // __lite4 debug handle
    '__lite4',
    'build',
    'plugins',
    'enabled',
    'objDef',
    'inventory'
];
