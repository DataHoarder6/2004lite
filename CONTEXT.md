# 2004lite

Fork of LostCityRS/Client-TS (build 274) with a RuneLite-style plugin host: stable
facade API, event bus, config, canvas overlays. Players keep the authentic 2004
client and gain third-party plugins.

## Language

**Host**: The forked client plus the plugin runtime (loader, event bus, config,
overlay manager). What a player downloads and runs.
_Avoid_: launcher, client (ambiguous with Client-TS)

**Plugin**: A third-party extension loaded by the Host at runtime. Trusted
in-process code with full facade access.
_Avoid_: addon, mod, script (script = RuneScript, server-side content)

**Facade (API)**: The versioned surface plugins code against. Interfaces + types
wrapping Client-TS internals; the only stable boundary across client updates.
_Avoid_: SDK, bridge

**Instrumentation**: The small hooks placed in Client-TS code (loop, draw,
packet decode) that the Facade and Host are wired to.
_Avoid_: mixin, injection (RuneLite terms; we own the source)

**Event**: A one-way broadcast emitted by instrumentation or the host runtime
after a game cycle or packet is processed. Plugins subscribe, never emit game
events.
_Avoid_: hook (that's the instrumentation point), message

**Overlay**: Plugin-drawn graphics composited onto the game canvas after the
game's own draw pass, in the game's coordinate space.
_Avoid_: HUD (the game's own interface layer), widget (game UI element)

**Sideload**: Loading a plugin from a local folder the player controls, no
review involved.
_Avoid_: install (reserved for the future plugin hub)

**Manifest**: The file declaring a plugin's id, entry, version, and target
client range. Hub-compatible by design (repo+commit fields optional).
_Avoid_: plugin.json (naming not settled)

**Client-TS**: Upstream LostCityRS TypeScript client port this repo forks.
Written "upstream" when contrasted with this fork.

**Game cycle**: One iteration of Client-TS's `mainloop` (50hz tick); events
flush after each cycle.

**Action**: A typed, game-legal write operation a plugin requests (walk-to,
chat, camera, interact) that the client executes exactly as if the player
performed it.
_Avoid_: packet, command, macro, bot

**Menu Swap**: Plugin mutation of the right-click menu that exchanges two
existing entries (text, action, params together). Swap-only: entries are never
added, removed, or synthesized; index 0 (Cancel) is untouchable.
_Avoid_: menu entry injection

**Plugin Hub**: The future community distribution channel (external repos,
commit-pinned, reviewed). Out of scope until MVP ships.
