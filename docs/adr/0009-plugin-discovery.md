# Plugin discovery via plugins/index.json, sideload CLI

The engine serves static files only — it cannot enumerate a directory. The
loader fetches `plugins/index.json` (a list of plugin ids) at startup, then
each id's manifest. Missing file = zero plugins, no error.

`bun run sideload add <built-folder>` (CLI in this repo) copies a plugin into
the engine's `public/plugins/<id>/` and updates the index. Manual editing
works too. The index format is the local-mode shape of the future hub
manifest list, so a hub needs no migration.
