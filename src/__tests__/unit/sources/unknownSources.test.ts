/**
 * The `unknown` audit (spec §4): a value written `unknown` in production code
 * is one from outside the type system, a sink a named contract types so, or a
 * library callback's — never a value the repository has a contract type for.
 * The scan is `helpers/unknownProvenanceScan.ts`, on the language service and
 * the type checker; a refusal lists each site with the types that reach it.
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
  productionProjects,
  scanFiles,
  scanProduction,
  staleReaders,
  THROWN_READERS,
  type UnknownSite,
  untypedAnswers,
  untypedProductionAnswers,
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

  it("a value read from the program's arguments or environment stays a boundary", () => {
    // `process.argv` and `process.env` handed down as typed parameters: what
    // is read from them is the program's input, whatever its static type.
    const value = site('programInput', 'value');
    assert.equal(value.cls, 'boundary');
    assert.equal(value.refused, false);
  });

  it("a value read from a parameter typed as the program's arguments stays a boundary", () => {
    // An exported reader nothing in the program calls: its parameter's
    // declared type (`ProgramArguments`, `NodeJS.ProcessEnv`) names the input.
    const flag = site('programInput', 'flag');
    assert.equal(flag.cls, 'boundary');
    assert.equal(flag.refused, false);
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

  it("an object literal's member typed by a named sink contract is a sink", () => {
    const meta = sitesOf('literalSink').filter(
      (entry) => entry.name === 'meta',
    );
    assert.deepEqual(
      meta.map((entry) => [entry.cls, entry.refused]),
      [['sink', false]],
    );
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

  it('a value a sink hands on is of any type, as the sink took it', () => {
    const sites = sitesOf('sinkForward').filter(
      (entry) => entry.name === 'meta',
    );
    assert.deepEqual(
      sites.map((entry) => [entry.key.split('#')[1], entry.cls, entry.refused]),
      [
        ['line(meta)', 'boundary', false],
        ['info(meta)', 'sink', false],
      ],
    );
  });

  it('a property its contract types unknown stays a boundary once narrowed', () => {
    const value = site('narrowedProperty', 'value');
    assert.equal(value.cls, 'boundary');
    assert.equal(value.refused, false);
  });

  it('a property read of a thrown value stays a boundary, whatever its narrowed type', () => {
    const name = site('thrownProperty', 'name');
    assert.equal(name.cls, 'boundary');
    assert.equal(name.refused, false);
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

  it('an unknown inside a container or behind an alias is read as a plain unknown, and refused when typed', () => {
    // Arrays, tuples, Record, Map, Set, Promise, a member of an object type,
    // a function type's return, and a function expression's parameter its
    // function type writes `unknown`: each fed by an `Order` (spec §4, the
    // audit's scope).
    const sites = sitesOf('containers');
    const by = (name: string) =>
      sites
        .filter((entry) => entry.name === name)
        .map((entry) => [entry.cls, entry.refused, entry.types]);
    assert.deepEqual(by('items'), [['typed', true, ['Order']]]);
    assert.deepEqual(by('bag'), [['typed', true, ['Order']]]);
    assert.deepEqual(by('pair'), [['typed', true, ['Order']]]);
    assert.deepEqual(by('map'), [['typed', true, ['Order']]]);
    assert.deepEqual(by('set'), [['typed', true, ['Order']]]);
    assert.deepEqual(by('work'), [['typed', true, ['Order']]]);
    assert.deepEqual(by('make'), [['typed', true, ['Order']]]);
    assert.deepEqual(by('visited'), [['typed', true, ['Order']]]);
    assert.deepEqual(by('held'), [['typed', true, ['Order']]]);
  });

  it('an alias of unknown is read as a plain unknown', () => {
    const aliased = site('containers', 'aliased');
    assert.deepEqual(
      [aliased.cls, aliased.refused, aliased.types],
      ['typed', true, ['Order']],
    );
  });

  it('an unknown inside a container fed from outside the type system passes', () => {
    const sites = sitesOf('containerBoundary').filter((entry) =>
      ['items', 'bag', 'make', 'visited'].includes(entry.name),
    );
    assert.deepEqual(
      sites.map((entry) => [entry.name, entry.cls, entry.refused]),
      [
        ['items', 'boundary', false],
        ['bag', 'boundary', false],
        ['make', 'boundary', false],
        ['visited', 'boundary', false],
      ],
    );
  });

  it("a site declared with a tool's arguments before their schema is input", () => {
    const args = site('toolInput', 'args');
    assert.equal(args.cls, 'boundary');
    assert.equal(args.refused, false);
  });

  it('a library call answering any is taken as unknown where it is made', () => {
    // JSON.parse and the XML parsers answer `any`: typed by the declaration
    // it lands in, the parse would skip its check (spec §4, JSON values).
    const file = path.join(FIXTURES, 'untypedAnswer.ts');
    const found = untypedAnswers(fixtureProgram([file]), new Set([file]));
    assert.deepEqual(
      found.map((entry) => entry.where.split('/').pop()),
      ['untypedAnswer.ts:9', 'untypedAnswer.ts:14', 'untypedAnswer.ts:35'],
    );
  });
});

describe('production code holds as unknown only what comes from outside the type system', () => {
  // Every production project: a refusal is listed with the types that reach
  // it.
  const sites = scanProduction();

  it('refuses no site', () => {
    assert.deepEqual(
      sites
        .filter((entry) => entry.refused)
        .map(
          (entry) =>
            `${entry.where} ${entry.key} ${entry.cls}: ${entry.types.join(' | ')}`,
        ),
      [],
    );
  });

  it("reads the root's TypeScript scripts too", () => {
    assert.ok(
      productionProjects().some(
        (project) =>
          project.dir === 'scripts' &&
          project.tsconfig === 'tsconfig.test.json',
      ),
    );
  });

  it('lists every reader of thrown values, and no reader that is gone', () => {
    assert.deepEqual(staleReaders(sites, THROWN_READERS), []);
  });

  it('takes every library answer of type any as unknown where it is made', () => {
    assert.deepEqual(
      untypedProductionAnswers().map((entry) => entry.where),
      [],
    );
  });
});
