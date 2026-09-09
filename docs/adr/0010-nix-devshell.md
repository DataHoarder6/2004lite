# Nix flake devshell for toolchain pinning

Devshell (not a NixOS module) pins bun, node 24, and Playwright's browsers so
NixOS contributors are reproducible. Non-nix contributors are unaffected:
plain `bun`/`node` still function against package.json. Engine/Client-TS
upstream files are never modified to accommodate the devshell.
