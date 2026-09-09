// Build all plugin sources into plugins/<id>/dist (ESM + manifest), then
// regen plugins/index.json. Plugins are pre-built ESM artifacts (ADR-0009).

import fs from 'fs';
import path from 'path';

const pluginsRoot = 'plugins';
const index: { id: string; name: string; version: string; facade: string; targetClientBuild: number }[] = [];

if (!fs.existsSync(pluginsRoot)) {
    console.error('plugins/ missing');
    process.exit(1);
}

for (const dir of fs.readdirSync(pluginsRoot)) {
    const source = path.join(pluginsRoot, dir);
    if (!fs.statSync(source).isDirectory() || dir.startsWith('.')) {
        continue;
    }

    const manifestPath = path.join(source, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.warn(`skipping ${dir}: no manifest.json`);
        continue;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const entry = path.join(source, 'src', 'index.ts');
    if (!fs.existsSync(entry)) {
        console.warn(`skipping ${dir}: no src/index.ts`);
        continue;
    }

    const dist = path.join(source, 'dist');
    fs.rmSync(dist, { recursive: true, force: true });
    fs.mkdirSync(dist, { recursive: true });

    // The facade (api/) is pure: types + stateless helpers. Bundle it into
    // every plugin so artifacts are self-contained ESM (ADR-0002).
    const result = await Bun.build({
        entrypoints: [entry],
        outdir: dist,
        target: 'browser',
        format: 'esm',
        minify: true
    });

    if (!result.success) {
        console.error(`build failed for ${dir}:`);
        for (const log of result.logs) {
            console.error(log);
        }
        process.exit(1);
    }

    fs.copyFileSync(manifestPath, path.join(dist, 'manifest.json'));
    index.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        facade: manifest.facade,
        targetClientBuild: manifest.targetClientBuild
    });
    console.log(`built plugin ${manifest.id} v${manifest.version}`);
}

fs.writeFileSync(path.join(pluginsRoot, 'index.json'), JSON.stringify(index, null, 4) + '\n');
console.log(`plugins/index.json regenerated (${index.length} plugins)`);
