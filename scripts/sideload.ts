// bun run sideload add <built-plugin-dir>
// Copies a built plugin folder (manifest.json + entry js) into the engine's
// public/plugins/ and updates the index (ADR-0009).

import fs from 'fs';
import path from 'path';

function engineDir(): string {
    const candidates = [process.env.ENGINE_DIR, '../engine', '../Engine-TS', '../Server/engine'];
    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        const resolved = path.resolve(candidate);
        if (fs.existsSync(path.join(resolved, 'public'))) {
            return resolved;
        }
    }
    console.error('ENGINE_DIR not set and no sibling engine found.');
    process.exit(1);
}

function usage(): never {
    console.log('usage: bun run sideload add <built-plugin-dir>');
    console.log('       bun run sideload remove <plugin-id>');
    process.exit(1);
}

const [command, arg] = process.argv.slice(2) as ['add' | 'remove', string | undefined];
if (!command || !arg || !['add', 'remove'].includes(command)) {
    usage();
}

const pluginsRoot = path.join(engineDir(), 'public', 'plugins');
fs.mkdirSync(pluginsRoot, { recursive: true });
const indexPath = path.join(pluginsRoot, 'index.json');

function readIndex(): { id: string; name: string; version: string; facade: string; targetClientBuild: number }[] {
    try {
        return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    } catch {
        return [];
    }
}

function writeIndex(index: { id: string; name: string; version: string; facade: string; targetClientBuild: number }[]): void {
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 4) + '\n');
}

if (command === 'add') {
    const source = path.resolve(arg);
    const manifestPath = path.join(source, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        console.error(`${source}: manifest.json missing`);
        process.exit(1);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const dest = path.join(pluginsRoot, manifest.id);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(source)) {
        fs.copyFileSync(path.join(source, file), path.join(dest, file));
    }

    const index = readIndex().filter(entry => entry.id !== manifest.id);
    index.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        facade: manifest.facade,
        targetClientBuild: manifest.targetClientBuild
    });
    writeIndex(index);
    console.log(`sideloaded ${manifest.id} v${manifest.version} -> ${dest}`);
} else {
    const index = readIndex().filter(entry => entry.id !== arg);
    writeIndex(index);
    fs.rmSync(path.join(pluginsRoot, arg), { recursive: true, force: true });
    console.log(`removed ${arg}`);
}
