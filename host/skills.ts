// Skill table mirroring src/client/Skill.ts, duplicated as host data so the
// facade never imports client internals (ADR-0002).

export const SKILL_NAMES: string[] = [
    'attack',
    'defence',
    'strength',
    'hitpoints',
    'ranged',
    'prayer',
    'magic',
    'cooking',
    'woodcutting',
    'fletching',
    'fishing',
    'firemaking',
    'crafting',
    'smithing',
    'mining',
    'herblore',
    'agility',
    'thieving',
    'slayer',
    '-unused-',
    'runecraft',
    '-unused-',
    '-unused-',
    '-unused-',
    '-unused-'
];

export const SKILL_USED: boolean[] = SKILL_NAMES.map(name => name !== '-unused-');
