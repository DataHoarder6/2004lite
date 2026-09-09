// Shared swap-rule text: parse/serialize/upsert/remove + option helpers.

import { describe, expect, it } from 'vitest';

import { isCaptureOption, parseCustomRules, removeCustomRules, serializeCustomRules, splitOption, stripTags, upsertCustomRule } from '#api/swaprules.js';

describe('stripTags/splitOption', () => {
    it('strips color tags and lowercases verb/target', () => {
        expect(stripTags('@yel@Bank Banker')).toBe('Bank Banker');
        expect(splitOption('@yel@Bank Banker')).toEqual({ verb: 'bank', target: 'banker' });
        expect(splitOption('Cancel')).toEqual({ verb: 'cancel', target: '' });
        expect(splitOption('@whi@Climb-up Staircase')).toEqual({ verb: 'climb-up', target: 'staircase' });
    });
});

describe('isCaptureOption', () => {
    it('matches only host chrome rows', () => {
        expect(isCaptureOption('> Left-click: Bank (Banker)')).toBe(true);
        expect(isCaptureOption('@yel@> Reset swaps (Banker)')).toBe(true);
        expect(isCaptureOption('@yel@Bank Banker')).toBe(false);
        expect(isCaptureOption('Walk here')).toBe(false);
    });
});

describe('parseCustomRules', () => {
    it('parses left and shift rules, comments, semicolons; ignores garbage', () => {
        const rules = parseCustomRules(`
            # comment
            banker => bank
            banker +shift => talk-to; lumbridge => sail
            garbage without arrow
            => missing-target
            bank!er => bank
            banker => bank-with-quantity-1
        `);
        expect(rules).toEqual([
            { target: 'banker', option: 'bank', shift: false },
            { target: 'banker', option: 'talk-to', shift: true },
            { target: 'lumbridge', option: 'sail', shift: false }
        ]);
    });

    it('dedupes repeated (target, shift) pairs', () => {
        expect(parseCustomRules('a => b\na => c')).toEqual([{ target: 'a', option: 'b', shift: false }]);
    });
});

describe('upsertCustomRule', () => {
    it('appends, replaces in place, and deletes on empty option', () => {
        let text = upsertCustomRule('', 'Banker', 'Bank', false);
        expect(text).toBe('banker => bank');
        text = upsertCustomRule(text, 'banker', 'trade', false);
        expect(text).toBe('banker => trade');
        text = upsertCustomRule(text, 'banker', 'talk-to', true);
        expect(parseCustomRules(text)).toHaveLength(2);
        text = upsertCustomRule(text, 'banker', '', false);
        expect(text).toBe('banker +shift => talk-to');
    });

    it('preserves comments and unrelated lines byte-identically', () => {
        const text = upsertCustomRule('zebra => sail\n# keep me', 'Man', 'Attack', false);
        expect(text).toBe('zebra => sail\n# keep me\nman => attack');
    });

    it('edits inside semicolon-joined lines and drops duplicates', () => {
        expect(upsertCustomRule('a => x; banker => bank; c => y', 'banker', 'trade', false)).toBe('a => x; banker => trade; c => y');
        expect(upsertCustomRule('banker => bank\nbanker => trade', 'banker', 'eat', false)).toBe('banker => eat');
    });
});

describe('removeCustomRules', () => {
    it('drops both shift variants for the target only, keeping comments', () => {
        const text = removeCustomRules('# c\nbanker => bank\nbanker +shift => talk-to\nsailor => travel', 'Banker');
        expect(text).toBe('# c\nsailor => travel');
    });
});

describe('serializeCustomRules', () => {
    it('round-trips through parse', () => {
        const rules = [
            { target: 'a', option: 'b', shift: false },
            { target: 'c', option: 'd', shift: true }
        ];
        expect(parseCustomRules(serializeCustomRules(rules))).toEqual(rules);
    });
});
