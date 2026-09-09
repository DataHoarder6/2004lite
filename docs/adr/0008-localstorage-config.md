# Settings live in localStorage behind a generated DOM panel

Per-plugin settings are declared as a config schema in code (key, type,
default, label) and persisted client-side in localStorage. The host renders a
DOM settings panel outside the canvas — this panel is settings UI, not an
Overlay. Profiles are per-browser, like RuneLite's per-profile config.
