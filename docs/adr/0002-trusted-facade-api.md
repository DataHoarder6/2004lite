# Trusted in-process plugins with a versioned facade API

Plugins run in-process, trusted (RuneLite model). Sandboxing (workers,
message-passing) was rejected: it kills canvas overlays, blocks reading client
state (the point of RuneLite-style plugins), and this is a hobby community —
hub review is proportionate when a hub exists; sideloaded plugins are the
player's own risk.

Plugins code only against a versioned Facade package (interfaces + types
wrapping Client-TS internals), never raw client modules. The facade is the
stable boundary across client updates; without it every plugin breaks on every
upstream merge.

Consequence: the facade must be curated as client internals churn. We target
build 274 only; multi-version support is deferred.
