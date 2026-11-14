/**
 * The plain-code text readings that replaced the regular expressions
 * (`src/lib/plainText.ts`).
 */
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
    expect(linesOf('a\r\nb\nc\rd')).toEqual(['a', 'b', 'c', 'd']);
  });
  it('keeps empty lines and a trailing empty one', () => {
    expect(linesOf('a\n\nb\n')).toEqual(['a', '', 'b', '']);
    expect(linesOf('')).toEqual(['']);
  });
  it('reads CR CR LF as two line ends', () => {
    expect(linesOf('a\r\r\nb')).toEqual(['a', '', 'b']);
  });
});

describe('character tests', () => {
  it('reads ASCII digits only', () => {
    expect(isAsciiDigits('0123')).toBe(true);
    expect(isAsciiDigits('')).toBe(false);
    expect(isAsciiDigits('12a')).toBe(false);
    expect(isAsciiDigits('١٢')).toBe(false);
    expect(leadingDigits('42,7')).toBe('42');
    expect(leadingDigits('x42')).toBe('');
  });
  it('reads a word character as an ASCII letter, digit or underscore', () => {
    expect([...'aZ9_'].every(isWordCharacter)).toBe(true);
    expect(isWordCharacter('-')).toBe(false);
    expect(isWordCharacter('ä')).toBe(false);
  });
  it('reads white space as trim does', () => {
    for (const blank of [' ', '\t', '\n', '\r', ' ', '　']) {
      expect(isBlank(blank)).toBe(true);
    }
    expect(isBlank('a')).toBe(false);
    expect(isBlank('')).toBe(false);
  });
});

describe('withoutTrailing and collapsedBlanks', () => {
  it('drops every trailing character of the kind', () => {
    expect(withoutTrailing('https://h:1///', '/')).toBe('https://h:1');
    expect(withoutTrailing('///', '/')).toBe('');
    expect(withoutTrailing('a/b', '/')).toBe('a/b');
  });
  it('turns each run of white space into one blank', () => {
    expect(collapsedBlanks('  a \t\n b  ')).toBe(' a b ');
    expect(collapsedBlanks('ab')).toBe('ab');
  });
});

describe('globMatches', () => {
  it('matches the whole text, letters without case', () => {
    expect(globMatches('Z*', 'zfoo')).toBe(true);
    expect(globMatches('Z*', 'AZ')).toBe(false);
    expect(globMatches('*_TEST', 'Z_TEST')).toBe(true);
    expect(globMatches('Z?B', 'ZAB')).toBe(true);
    expect(globMatches('Z?B', 'ZB')).toBe(false);
  });
  it('reads a dot as itself', () => {
    expect(globMatches('Z.CL*', 'Z.CLASS')).toBe(true);
    expect(globMatches('Z.CL*', 'ZXCLASS')).toBe(false);
  });
  it('lets a star stand for nothing and backtracks over runs', () => {
    expect(globMatches('*', '')).toBe(true);
    expect(globMatches('A*B*C', 'AXBYBZC')).toBe(true);
    expect(globMatches('A*B*C', 'AXBYBZ')).toBe(false);
    expect(globMatches('/NS/*', '/ns/name')).toBe(true);
  });
});

describe('ASCII only: no Unicode case mapping', () => {
  // The Kelvin sign, a dotted capital I, a dotless small i, a sharp s.
  const NOT_ASCII = ['K', 'İ', 'ı', 'ß'];
  it('reads none of them as a letter', () => {
    for (const character of NOT_ASCII) {
      expect(isAsciiLetter(character)).toBe(false);
      expect(isWordCharacter(character)).toBe(false);
    }
  });
  it('folds none of them onto an ASCII letter', () => {
    expect(wordAt('ınclude', 0, 'INCLUDE')).toBe(false);
    expect(wordAt('Key', 0, 'key')).toBe(false);
    expect(wordAt('Include', 0, 'iNCLUDE')).toBe(true);
    expect(globMatches('Zß*', 'ZSSX')).toBe(false);
    expect(globMatches('K*', 'kx')).toBe(false);
    expect(globMatches('k*', 'KX')).toBe(true);
    expect(asciiUpper('abıßz')).toBe('ABıßZ');
    expect(asciiLower('ABİKZ')).toBe('abİKz');
  });
});
