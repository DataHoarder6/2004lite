// Snapshot server attack rates into data/attackrates.json (ADR-0011).
//
// NPC/player attack cadence is server-authoritative: Content `attackrate`
// params (ticks of 0.6s, default 4). The client cache carries no speed
// fields, so timer plugins consume this checked-in snapshot. Re-run after
// pulling Content: `bun run data:regen`. CI fails on drift (see
// tests/unit/attackrates.test.ts).

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CONTENT_DIR = process.env.CONTENT_DIR ?? path.resolve('..', 'content');
const OUT = path.resolve('data', 'attackrates.json');

function readPack(file: string): Map<string, number> {
    const map = new Map<string, number>();
    for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
        const match = line.match(/^(\d+)=(.+)$/);
        if (match) {
            map.set(match[2].trim(), Number(match[1]));
        }
    }
    return map;
}

function walk(dir: string, ext: string, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, ext, out);
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            out.push(full);
        }
    }
}

/** debugname -> explicit attackrate, last section wins. */
function collectRates(files: string[]): Map<string, number> {
    const rates = new Map<string, number>();
    for (const file of files) {
        let current: string | null = null;
        for (const raw of fs.readFileSync(file, 'utf-8').split('\n')) {
            const line = raw.trim();
            if (line === '' || line.startsWith('//')) {
                continue;
            }
            const section = line.match(/^\[(.+)\]$/);
            if (section) {
                current = section[1].trim();
                continue;
            }
            if (current) {
                const param = line.match(/^param=attackrate,(-?\d+)$/);
                if (param) {
                    rates.set(current, Number(param[1]));
                }
            }
        }
    }
    return rates;
}

function resolveIds(rates: Map<string, number>, pack: Map<string, number>, label: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, rate] of rates) {
        const id = pack.get(name);
        if (id === undefined) {
            console.warn(`attackrates: no ${label} id for [${name}], skipped`);
            continue;
        }
        out[String(id)] = rate;
    }
    return out;
}

/**
 * Obj debugnames whose category attacks rapid at style index 1 (combat.rs2
 * category -> style-table mapping: bow/crossbow/thrown/javelin tables carry
 * style_ranged_rapid at index 1; melee/unarmed tables never do).
 */
const RAPID_CATEGORIES = new Set(['weapon_bow', 'weapon_crossbow', 'weapon_thrown', 'weapon_javelin']);

/** debugnames in a rapid category (category= line inside the obj section). */
function collectRapidWeapons(files: string[]): Set<string> {
    const rapid = new Set<string>();
    for (const file of files) {
        let current: string | null = null;
        for (const raw of fs.readFileSync(file, 'utf-8').split('\n')) {
            const line = raw.trim();
            if (line === '' || line.startsWith('//')) {
                continue;
            }
            const section = line.match(/^\[(.+)\]$/);
            if (section) {
                current = section[1].trim();
                continue;
            }
            if (current) {
                const category = line.match(/^category=(\S+)$/);
                if (category && RAPID_CATEGORIES.has(category[1])) {
                    rapid.add(current);
                }
            }
        }
    }
    return rapid;
}

/** Resolved rapid obj ids, ascending (stable snapshot bytes). */
function resolveRapidIds(names: Set<string>, pack: Map<string, number>): number[] {
    const ids: number[] = [];
    for (const name of names) {
        const id = pack.get(name);
        if (id === undefined) {
            console.warn(`attackrates: no obj id for rapid [${name}], skipped`);
            continue;
        }
        ids.push(id);
    }
    return ids.sort((a, b) => a - b);
}

const scriptsDir = path.join(CONTENT_DIR, 'scripts');
if (!fs.existsSync(scriptsDir)) {
    console.error(`CONTENT_DIR has no scripts/: ${CONTENT_DIR}`);
    process.exit(1);
}

const npcFiles: string[] = [];
const objFiles: string[] = [];
walk(scriptsDir, '.npc', npcFiles);
walk(scriptsDir, '.obj', objFiles);

const npc = resolveIds(collectRates(npcFiles), readPack(path.join(CONTENT_DIR, 'pack', 'npc.pack')), 'npc');
const objPack = readPack(path.join(CONTENT_DIR, 'pack', 'obj.pack'));
const weapon = resolveIds(collectRates(objFiles), objPack, 'obj');
const rapid = resolveRapidIds(collectRapidWeapons(objFiles), objPack);

let contentCommit = 'unknown';
try {
    contentCommit = execSync('git rev-parse HEAD', { cwd: CONTENT_DIR, encoding: 'utf-8' }).trim();
} catch {
    console.warn('attackrates: could not read Content commit hash');
}

const snapshot = { contentCommit, defaultRate: 4, npc, weapon, rapid };
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 4) + '\n');
console.log(`attackrates: ${Object.keys(npc).length} npc + ${Object.keys(weapon).length} weapon rates + ${rapid.length} rapid weapons from ${contentCommit.slice(0, 8)} -> ${OUT}`);
