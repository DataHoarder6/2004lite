# Overlays composite onto the game canvas

Plugin overlays draw into the game's own 2D canvas after the game's draw pass
(in the `mainredraw` tail), in the game's coordinate space, via a post-draw
overlay pass. Rejected: a DOM layer above the canvas — it can't share the
game's framebuffer/coordinate space and feels foreign.

A DOM side-panel for plugin config may exist later as a separate channel; it
is not an Overlay.
