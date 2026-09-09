# Sideload first, manifest hub-compatible

MVP ships local-folder sideloading only. The manifest format is hub-compatible
from day one (repo + commit fields optional) so a future Plugin Hub (external
repos, commit-pinned, reviewed — mirroring runelite/plugin-hub) needs no
migration.

No hub machinery (installer, updater, review, dependency verification) is
built before the MVP proves the facade is real.
