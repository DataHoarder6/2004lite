// Generate data/packet-names.json from the protocol enums (ADR-0014).
// The enums are `const enum` (no runtime reverse map), so the observer
// plugin reads this snapshot instead. Re-run after touching ServerProt or
// ClientProt: `bun run scripts/gen-packet-names.ts` (drift-checked in CI).

import fs from 'fs';
import path from 'path';

const OUT = path.resolve('data', 'packet-names.json');

function parseEnum(file: string): Record<string, string> {
    const out: Record<string, string> = {};
    const seen = new Set<number>();
    for (const raw of fs.readFileSync(file, 'utf-8').split('\n')) {
        const match = raw.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\d+)/);
        if (!match) {
            continue;
        }
        const id = Number(match[2]);
        if (seen.has(id)) {
            console.warn(`packet-names: duplicate id ${id} (${match[1]}) in ${file}, first wins`);
            continue;
        }
        seen.add(id);
        out[String(id)] = match[1];
    }
    return out;
}

const up = parseEnum(path.resolve('src', 'io', 'ServerProt.ts'));
const down = parseEnum(path.resolve('src', 'io', 'ClientProt.ts'));

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ up, down }, null, 4) + '\n');
console.log(`packet-names: ${Object.keys(up).length} up + ${Object.keys(down).length} down -> ${OUT}`);
