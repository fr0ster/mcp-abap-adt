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
  staleReaders,
  type UnknownSite,
} from './helpers/unknownProvenanceScan';

const FIXTURES = path.join(
  REPO,
  'src/__tests__/unit/sources/__fixtures__/unknownProvenance',
);

function sitesOf(
  fixture: string,
  readers: ReadonlySet<string> = new Set(),
): UnknownSite[] {
  const file = path.join(FIXTURES, `${fixture}.ts`);
  return scanFiles(fixtureProgram([file]), new Set([file]), readers);
}

const READER =
  'src/__tests__/unit/sources/__fixtures__/unknownProvenance/thrownReader.ts#describeFailure(thrown)';

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

  it('a boundary value written by shorthand stays a boundary', () => {
    const id = site('shorthand', 'id');
    assert.equal(id.cls, 'boundary');
    assert.equal(id.refused, false);
  });

  it('an awaited value is typed by what the promise holds, not the promise', () => {
    const value = site('awaited', 'value');
    assert.equal(value.cls, 'boundary');
    assert.equal(value.refused, false);
  });

  it('a named sink passes', () => {
    const meta = sitesOf('namedSink').filter((entry) => entry.name === 'meta');
    assert.equal(meta.length, 1);
    assert.equal(meta[0]?.cls, 'sink');
    assert.equal(meta[0]?.refused, false);
  });

  it('an answer serializer is a named sink', () => {
    const payload = sitesOf('answerSerializer').filter(
      (entry) => entry.name === 'payload',
    );
    assert.deepEqual(
      payload.map((entry) => [entry.cls, entry.refused]),
      [['sink', false]],
    );
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

  it('a file is found however its name is spelled', () => {
    // TypeScript names a file with `/` on every platform, `path.join` with
    // the platform's separator: a Windows run found no site at all. A
    // spelling with `..` differs from TypeScript's on every platform.
    const spelled = `${FIXTURES}${path.sep}deeper${path.sep}..${path.sep}typed.ts`;
    const sites = scanFiles(fixtureProgram([spelled]), new Set([spelled]));
    assert.deepEqual(
      sites.filter((entry) => entry.name === 'order').map((entry) => entry.cls),
      ['typed'],
    );
  });

  it('a listed reader of thrown values passes, though a typed value reaches it too', () => {
    const sites = sitesOf('thrownReader', new Set([READER])).filter(
      (entry) => entry.name === 'thrown',
    );
    assert.deepEqual(
      sites.map((entry) => [entry.key, entry.cls, entry.refused]),
      [[READER, 'reader', false]],
    );
  });

  it('an unlisted reader of thrown values is refused', () => {
    const sites = sitesOf('thrownReader').filter(
      (entry) => entry.name === 'thrown',
    );
    assert.deepEqual(
      sites.map((entry) => [entry.cls, entry.refused]),
      [['reader', true]],
    );
    assert.deepEqual(sites[0]?.types, ['Error']);
  });

  it('a listed name no reader has is stale', () => {
    const listed = new Set([READER, `${READER}x`]);
    assert.deepEqual(staleReaders(sitesOf('thrownReader', listed), listed), [
      `${READER}x`,
    ]);
    // A typed site is no reader, listed or not.
    const typed = sitesOf('typed', listed).filter(
      (entry) => entry.name === 'order',
    );
    assert.deepEqual(
      typed.map((entry) => entry.cls),
      ['typed'],
    );
  });

  it('a mixed site is refused', () => {
    const value = site('mixed', 'value');
    assert.equal(value.cls, 'mixed');
    assert.equal(value.refused, true);
    assert.deepEqual(value.types, ['Order']);
  });
});
