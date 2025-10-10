'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeCookie,
    parseHeaderOptions
} = require('../lib/observability-http-utils');

test('normalizeCookie prefixes guardian_session when only token provided', () => {
    assert.equal(normalizeCookie('abc123'), 'guardian_session=abc123');
    assert.equal(normalizeCookie('  token-value  '), 'guardian_session=token-value');
});

test('normalizeCookie returns raw value when cookie header already provided', () => {
    assert.equal(normalizeCookie('guardian_session=abc123; Path=/'), 'guardian_session=abc123; Path=/');
    assert.equal(normalizeCookie('foo=bar'), 'foo=bar');
});

test('normalizeCookie handles empty or invalid values', () => {
    assert.equal(normalizeCookie(''), '');
    assert.equal(normalizeCookie(null), '');
    assert.equal(normalizeCookie(undefined), '');
});

test('parseHeaderOptions collects well-formed headers and warns on invalid entries', () => {
    const { headers, warnings } = parseHeaderOptions([
        'X-Test: value',
        'Accept: application/json',
        'InvalidHeader',
        '  Empty:   '
    ]);

    assert.deepEqual(headers, {
        'X-Test': 'value',
        'Accept': 'application/json'
    });
    assert.equal(warnings.length, 2);
    assert.ok(warnings.some((warning) => warning.toLowerCase().includes('invalid header')));
});

test('parseHeaderOptions supports single string input', () => {
    const { headers, warnings } = parseHeaderOptions('Content-Type: application/json');
    assert.deepEqual(headers, { 'Content-Type': 'application/json' });
    assert.equal(warnings.length, 0);
});
