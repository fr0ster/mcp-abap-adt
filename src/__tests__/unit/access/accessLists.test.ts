/**
 * The package, request and table grammars (spec §2.2): each form read into
 * its entry, upper-cased, and every malformed form refused naming the form.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parsePackageEntry,
  parseRequestEntry,
  parseTableEntry,
} from '../../../lib/access/accessLists';
import { ParameterRefusal } from '../../../lib/config/authParameters';

const ROW = 'the row';

function refusedBy(
  parse: (text: string, name: string) => unknown,
  text: string,
): void {
  assert.throws(
    () => parse(text, ROW),
    (error: unknown) =>
      error instanceof ParameterRefusal &&
      error.words.startsWith(`Invalid ${ROW} entry "${text}": `),
  );
}

describe('parsePackageEntry', () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['ZFOO', 'exact', 'ZFOO'],
    ['$TMP', 'exact', '$TMP'],
    ['Z*', 'prefix', 'Z'],
    ['ZFOO/**', 'subtree', 'ZFOO'],
    ['/ABC/ZFOO/**', 'subtree', '/ABC/ZFOO'],
    ['zfoo', 'exact', 'ZFOO'],
    ['zfoo/**', 'subtree', 'ZFOO'],
    ['z*', 'prefix', 'Z'],
  ];
  for (const [text, kind, name] of cases) {
    it(`reads ${text} as ${kind} ${name}`, () => {
      assert.deepEqual(parsePackageEntry(text, ROW), { kind, name });
    });
  }
  for (const text of ['Z*O', 'ZFOO**', 'Z*/**', '/**', 'ZF OO', '*', '']) {
    it(`refuses "${text}"`, () => refusedBy(parsePackageEntry, text));
  }
});

describe('parseRequestEntry', () => {
  it('reads a number and a prefix, upper-cased', () => {
    assert.deepEqual(parseRequestEntry('A4HK900123', ROW), {
      kind: 'exact',
      name: 'A4HK900123',
    });
    assert.deepEqual(parseRequestEntry('a4hk*', ROW), {
      kind: 'prefix',
      name: 'A4HK',
    });
  });
  for (const text of ['A4HK/1', 'A*K', '*', '']) {
    it(`refuses "${text}"`, () => refusedBy(parseRequestEntry, text));
  }
});

describe('parseTableEntry', () => {
  it('reads a name and a prefix, upper-cased', () => {
    assert.deepEqual(parseTableEntry('mara', ROW), {
      kind: 'exact',
      name: 'MARA',
    });
    assert.deepEqual(parseTableEntry('ZT*', ROW), {
      kind: 'prefix',
      name: 'ZT',
    });
  });
  for (const text of ['ZT/**', 'Z*T', 'M ARA', '*']) {
    it(`refuses "${text}"`, () => refusedBy(parseTableEntry, text));
  }
});
