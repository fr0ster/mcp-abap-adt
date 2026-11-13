/**
 * The `unknown` audit (spec §4): a value written `unknown` in production code
 * is one from outside the type system, a sink a named contract types so, or a
 * library callback's — never a value the repository has a contract type for.
 * The scan is `helpers/unknownProvenanceScan.ts`, on the language service and
 * the type checker; `npm run measure:unknown` lists what it refuses.
 *
 * Each fixture under `__fixtures__/unknownProvenance` is one class, reported
 * or not as its class is.
 */

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { REPO } from './helpers/failureScan';
import {
  fixtureProgram,
  scanFiles,
  type UnknownSite,
} from './helpers/unknownProvenanceScan';

const FIXTURES = path.join(
  REPO,
  'src/__tests__/unit/sources/__fixtures__/unknownProvenance',
);

function sitesOf(fixture: string): UnknownSite[] {
  const file = path.join(FIXTURES, `${fixture}.ts`);
  return scanFiles(fixtureProgram([file]), new Set([file]));
}

function site(fixture: string, name: string): UnknownSite {
  const found = sitesOf(fixture).filter((entry) => entry.name === name);
  assert.equal(found.length, 1, `${fixture}: one site named ${name}`);
  const [only] = found;
  assert.ok(only);
  return only;
}

describe('the unknown audit refuses a value the repository has a type for', () => {
  it('a typed site is refused, with the type that reaches it', () => {
    const order = site('typed', 'order');
    assert.equal(order.cls, 'typed');
    assert.equal(order.refused, true);
    assert.deepEqual(order.types, ['Order']);
  });

  it('a value laundered through an unknown parameter is followed to its type', () => {
    const read = sitesOf('laundered').filter((entry) =>
      entry.where.endsWith('laundered.ts:7'),
    );
    assert.equal(read.length, 1);
    assert.equal(read[0]?.cls, 'typed');
    assert.equal(read[0]?.refused, true);
    assert.deepEqual(read[0]?.types, ['Order']);
  });

  it('a boundary narrowed in plain code passes', () => {
    const value = site('boundary', 'value');
    assert.equal(value.cls, 'boundary');
    assert.equal(value.refused, false);
  });

  it('a named sink passes', () => {
    const meta = sitesOf('namedSink').filter((entry) => entry.name === 'meta');
    assert.equal(meta.length, 1);
    assert.equal(meta[0]?.cls, 'sink');
    assert.equal(meta[0]?.refused, false);
  });

  it('an unnamed sink is refused', () => {
    const value = site('unnamedSink', 'value');
    assert.equal(value.refused, true);
    assert.deepEqual(value.types, ['number', 'string']);
  });

  it('a library callback passes', () => {
    const sites = sitesOf('callback').filter(
      (entry) => entry.kind === 'parameter',
    );
    assert.deepEqual(
      sites.map((entry) => [entry.name, entry.cls, entry.refused]),
      [
        ['reason', 'callback', false],
        ['value', 'callback', false],
      ],
    );
  });

  it('a mixed site is refused', () => {
    const value = site('mixed', 'value');
    assert.equal(value.cls, 'mixed');
    assert.equal(value.refused, true);
    assert.deepEqual(value.types, ['Order']);
  });
});
