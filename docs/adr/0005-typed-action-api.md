# Typed action API for the write path

Plugins can change the game, not just observe it. The facade exposes curated,
typed, game-legal actions (walk-to, chat, camera, entity/item/interface
interactions) that serialize into the exact packet paths the client itself
uses. No raw-packet primitive: nothing that turns every plugin install into an
arbitrary protocol writer.

Synthetic mouse/keyboard input is deferred, not rejected: if advanced plugins
genuinely need it later, it lands as a versioned facade addition behind the
same action-style validation, not as a raw input primitive.
