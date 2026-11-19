/**
 * The plain-code text readings that replaced the regular expressions
 * (`src/lib/plainText.ts`).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  asciiLower,
  asciiUpper,
  collapsedBlanks,
  globMatches,
  isAsciiDigits,
  isAsciiLetter,
  isBlank,
  isWordCharacter,
  leadingDigits,
  linesOf,
  withoutTrailing,
  wordAt,
} from '../../lib/plainText';

describe('linesOf', () => {
  it('ends a line at CR LF, LF and a lone CR', () => {
    assert.deepStrictEqual(linesOf('a\r\nb\nc\rd'), ['a', 'b', 'c', 'd']);
  });
  it('keeps empty lines and a trailing empty one', () => {
    assert.deepStrictEqual(linesOf('a\n\nb\n'), ['a', '', 'b', '']);
    assert.deepStrictEqual(linesOf(''), ['']);
  });
  it('reads CR CR LF as two line ends', () => {
    assert.deepStrictEqual(linesOf('a\r\r\nb'), ['a', '', 'b']);
  });
});

describe('character tests', () => {
  it('reads ASCII digits only', () => {
    assert.equal(isAsciiDigits('0123'), true);
    assert.equal(isAsciiDigits(''), false);
    assert.equal(isAsciiDigits('12a'), false);
    assert.equal(isAsciiDigits('١٢'), false);
    assert.equal(leadingDigits('42,7'), '42');
    assert.equal(leadingDigits('x42'), '');
  });
  it('reads a word character as an ASCII letter, digit or underscore', () => {
    assert.equal([...'aZ9_'].every(isWordCharacter), true);
    assert.equal(isWordCharacter('-'), false);
    assert.equal(isWordCharacter('ä'), false);
  });
  it('reads white space as trim does', () => {
    for (const blank of [' ', '\t', '\n', '\r', ' ', '　']) {
      assert.equal(isBlank(blank), true);
    }
    assert.equal(isBlank('a'), false);
    assert.equal(isBlank(''), false);
  });
});

describe('withoutTrailing and collapsedBlanks', () => {
  it('drops every trailing character of the kind', () => {
    assert.equal(withoutTrailing('https://h:1///', '/'), 'https://h:1');
    assert.equal(withoutTrailing('///', '/'), '');
    assert.equal(withoutTrailing('a/b', '/'), 'a/b');
  });
  it('turns each run of white space into one blank', () => {
    assert.equal(collapsedBlanks('  a \t\n b  '), ' a b ');
    assert.equal(collapsedBlanks('ab'), 'ab');
  });
});

describe('globMatches', () => {
  it('matches the whole text, letters without case', () => {
    assert.equal(globMatches('Z*', 'zfoo'), true);
    assert.equal(globMatches('Z*', 'AZ'), false);
    assert.equal(globMatches('*_TEST', 'Z_TEST'), true);
    assert.equal(globMatches('Z?B', 'ZAB'), true);
    assert.equal(globMatches('Z?B', 'ZB'), false);
  });
  it('reads a dot as itself', () => {
    assert.equal(globMatches('Z.CL*', 'Z.CLASS'), true);
    assert.equal(globMatches('Z.CL*', 'ZXCLASS'), false);
  });
  it('lets a star stand for nothing and backtracks over runs', () => {
    assert.equal(globMatches('*', ''), true);
    assert.equal(globMatches('A*B*C', 'AXBYBZC'), true);
    assert.equal(globMatches('A*B*C', 'AXBYBZ'), false);
    assert.equal(globMatches('/NS/*', '/ns/name'), true);
  });
});

describe('ASCII only: no Unicode case mapping', () => {
  // The Kelvin sign, a dotted capital I, a dotless small i, a sharp s.
  const NOT_ASCII = ['K', 'İ', 'ı', 'ß'];
  it('reads none of them as a letter', () => {
    for (const character of NOT_ASCII) {
      assert.equal(isAsciiLetter(character), false);
      assert.equal(isWordCharacter(character), false);
    }
  });
  it('folds none of them onto an ASCII letter', () => {
    assert.equal(wordAt('ınclude', 0, 'INCLUDE'), false);
    assert.equal(wordAt('Key', 0, 'key'), false);
    assert.equal(wordAt('Include', 0, 'iNCLUDE'), true);
    assert.equal(globMatches('Zß*', 'ZSSX'), false);
    assert.equal(globMatches('K*', 'kx'), false);
    assert.equal(globMatches('k*', 'KX'), true);
    assert.equal(asciiUpper('abıßz'), 'ABıßZ');
    assert.equal(asciiLower('ABİKZ'), 'abİKz');
  });
});
