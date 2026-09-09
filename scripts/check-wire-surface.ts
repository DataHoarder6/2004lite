// Fail the install if any wire-surface name is missing from the built
// client bundle (i.e. terser renamed a cross-boundary property).
// Run: bun run check:wire (also runs inside host:install).

import fs from 'fs';
import { WIRE_SURFACE } from '../host/wire-surface.js';

const bundle = fs.readFileSync('out/client.js', 'utf-8');

const missing: string[] = [];
for (const name of new Set(WIRE_SURFACE)) {
    // property access (.name), definition ({name, }name, or }name in minified
    // classes) or key ("name"). The } alternative matters: methods nothing in
    // the client bundle calls only occur as `}name(` definitions.
    const pattern = new RegExp(`[.{:},"'\\s}]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^\\w$])`);
    if (!pattern.test(bundle)) {
        missing.push(name);
    }
}

if (missing.length > 0) {
    console.error(`wire surface broken in out/client.js — missing: ${missing.join(', ')}`);
    console.error('Is host/wire-surface.ts wired into bundle.ts reserved?');
    process.exit(1);
}

console.log(`wire surface ok (${new Set(WIRE_SURFACE).size} names present in out/client.js)`);
