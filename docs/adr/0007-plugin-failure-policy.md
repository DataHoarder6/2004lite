# Plugin failure auto-disables, never crashes the host

Instrumentation wraps every plugin callback (event handlers, overlay draws,
action calls). An exception logs, auto-disables that plugin (subscriptions
stopped, overlays dropped, marked in config panel, canvas-edge toast), and the
game continues. Invalid action targets raise typed errors client-side instead
of malformed packets that would drop the connection.

Trusted in-process code still isn't allowed to take the game down.
