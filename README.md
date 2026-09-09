# 2004lite

A RuneLite-style plugin host for [LostCityRS/Client-TS](https://github.com/LostCityRS/Client-TS)
(the 2004scape TypeScript client, build 274). Players keep the authentic 2004
client and gain third-party plugins: event bus, typed action API, config
panel, canvas overlays.

**Status: pre-MVP.** See [docs/mvp.md](./docs/mvp.md) for what's being built
and [docs/adr/](./docs/adr/) for why.

## Quickstart (dev)

Requires the [LostCityRS/Server](https://github.com/LostCityRS/Server) setup
(engine + content sibling repos) and bun.

```
bun install
bun run build            # build client bundle to out/
bun run host:install     # copy into $ENGINE_DIR/public/
```

Then play at `http://localhost/rs2.cgi`.

Plugins are trusted in-process code. Do not install plugins from people you
don't trust.

## License

Upstream Client-TS files are MIT (see LICENSE, © LostCityRS). 2004lite host,
facade, and plugin code: MIT.
