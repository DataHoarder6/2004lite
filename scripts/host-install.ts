// Build + copy artifacts into the engine's public/ directory (ADR-0009 dev
// workflow). ENGINE_DIR defaults to a sibling Server-style layout; override
// in .env.

import fs from 'fs';
import path from 'path';

const engineDir = process.env.ENGINE_DIR ?? findEngine();
function findEngine(): string {
    // sibling engine checkout layouts
    const candidates = ['../engine', '../Engine-TS', '../Server/engine'];
    for (const candidate of candidates) {
        const resolved = path.resolve(candidate);
        if (fs.existsSync(path.join(resolved, 'public'))) {
            return resolved;
        }
    }
    console.error('ENGINE_DIR not set and no sibling engine found. Set ENGINE_DIR in .env.');
    process.exit(1);
}

const outDir = 'out';
const target = path.join(engineDir, 'public', 'client');

function sh(cmd: string[]): void {
    const result = Bun.spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' });
    if (result.exitCode !== 0) {
        console.error(`failed: ${cmd.join(' ')}`);
        process.exit(result.exitCode ?? 1);
    }
}

console.log('building client bundle…');
sh(['bun', 'run', 'build']);
console.log('checking wire surface…');
sh(['bun', 'run', 'check:wire']);
console.log('building plugins…');
sh(['bun', 'run', 'plugins:build']);

if (!fs.existsSync(outDir)) {
    console.error('out/ missing after build');
    process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
for (const file of fs.readdirSync(outDir)) {
    fs.copyFileSync(path.join(outDir, file), path.join(target, file));
    console.log(`copied out/${file} -> ${target}/${file}`);
}

// plugins
const pluginsTarget = path.join(engineDir, 'public', 'plugins');
fs.mkdirSync(pluginsTarget, { recursive: true });
const indexSource = path.join('plugins', 'index.json');
if (fs.existsSync(indexSource)) {
    fs.copyFileSync(indexSource, path.join(pluginsTarget, 'index.json'));
    console.log('copied plugins/index.json');
}
for (const dir of fs.readdirSync('plugins')) {
    const built = path.join('plugins', dir, 'dist');
    if (!fs.existsSync(built)) {
        continue;
    }
    const dest = path.join(pluginsTarget, dir);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(built)) {
        fs.copyFileSync(path.join(built, file), path.join(dest, file));
    }
    console.log(`copied plugins/${dir}/dist -> ${dest}`);
}

console.log('host:install complete.');
