// Observer filter rules: prefix categories + text filter.

import { describe, expect, it } from 'vitest';

import { categorize, categoryKey, matchesTextFilter } from '../../plugins/packet-observer/src/filter.js';

describe('categorize', () => {
    it('sorts known opcodes, unknowns fall to misc', () => {
        expect(categorize('upstream', 'PLAYER_INFO')).toBe('movement');
        expect(categorize('upstream', 'OBJ_ADD')).toBe('scene');
        expect(categorize('upstream', 'IF_SETTEXT')).toBe('interface');
        expect(categorize('upstream', 'MESSAGE_GAME')).toBe('chat');
        expect(categorize('upstream', 'UPDATE_STAT')).toBe('stat');
        expect(categorize('upstream', 'CAM_SHAKE')).toBe('camera');
        expect(categorize('upstream', 'LOGOUT')).toBe('misc');
        expect(categorize('downstream', 'EVENT_MOUSE_MOVE')).toBe('input');
        expect(categorize('downstream', 'ANTICHEAT_CYCLELOGIC7')).toBe('anticheat');
        expect(categorize('downstream', 'OPNPC2')).toBe('action');
        expect(categorize('downstream', 'IF_BUTTON')).toBe('action');
        expect(categorize('downstream', 'NO_TIMEOUT')).toBe('input');
        expect(categorize('downstream', 'SOMETHING_NEW')).toBe('misc');
    });

    it('builds stable category config keys', () => {
        expect(categoryKey('upstream', 'movement')).toBe('up-movement');
        expect(categoryKey('downstream', 'action')).toBe('down-action');
    });
});

describe('matchesTextFilter', () => {
    it('matches comma substrings, stars allowed, empty passes', () => {
        expect(matchesTextFilter('', 'OBJ_ADD')).toBe(true);
        expect(matchesTextFilter('obj_*', 'OBJ_ADD')).toBe(true);
        expect(matchesTextFilter('if_button,opnpc2', 'OPNPC2')).toBe(true);
        expect(matchesTextFilter('chat', 'OBJ_ADD')).toBe(false);
    });
});
