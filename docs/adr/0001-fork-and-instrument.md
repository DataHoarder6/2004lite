# Fork Client-TS and own the instrumentation

We fork LostCityRS/Client-TS into this repo rather than wrapping it externally.
The plugin host needs hooks inside `gameLoop`/`gameDraw`/packet decode; a wrapper
would monkey-patch 12k-line internals, which is more brittle than owning the
seam. Instrumentation stays small and optional-looking so the fork stays
diffable against upstream branch 274.

We do not intend to PR the plugin system upstream. Upstream's core value is a
faithful historical port; this repo is the RuneLite analogue for it. Keep
upstream merges mechanical: instrumentation = small, marked edits in
Client-TS files; host runtime = separate modules upstream doesn't have.
