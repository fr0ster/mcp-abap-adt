/**
 * The `unknown` audit (spec §4), a sweep of every node: a declaration or an
 * expression of production code whose type holds `unknown` (or `any`) at any
 * depth is refused, unless it is one of the listed boundaries. The sweep is
 * `helpers/unknownSweep.ts`, on the type checker; a refusal lists each site
 * with the positions charged to it and the typed values put there.
 *
 * Each fixture under `__fixtures__/unknownProvenance` is one form, refused,
 * or passing under its boundary kind (listed by exact site where the kind
 * needs one).
 */

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { REPO } from './helpers/failureScan';
import {
  type BoundaryKind,
  fixtureProgram,
  type ListedSites,
  ownFile,
  SINK_SLOTS,
  type SweepSite,
  sinkSlotReads,
  staleEntries,
  sweepFiles,
} from './helpers/unknownSweep';

const FIXTURES = path.join(
  REPO,
  'src/__tests__/unit/sources/__fixtures__/unknownProvenance',
);
const AT = 'src/__tests__/unit/sources/__fixtures__/unknownProvenance';

interface Listing {
  readonly thrown?: readonly string[];
  readonly parse?: readonly string[];
  readonly programInput?: readonly string[];
  readonly sink?: readonly string[];
}

function lists(listing: Listing = {}): ListedSites {
  return {
    thrown: new Set(listing.thrown ?? []),
    parse: new Set(listing.parse ?? []),
    programInput: new Set(listing.programInput ?? []),
    sink: new Set(listing.sink ?? []),
  };
}

function sitesOf(
  fixture: string,
  listing: Listing = {},
  slots: ReadonlyMap<string, string> = SINK_SLOTS,
): SweepSite[] {
  const file = path.join(FIXTURES, `${fixture}.ts`);
  return sweepFiles(
    fixtureProgram([file]),
    new Set([file]),
    lists(listing),
    slots,
  );
}

/** `[boundary, refused, types]` of each site named `name`, of kind `kind`. */
function judged(
  sites: readonly SweepSite[],
  name: string,
  kind?: string,
): [BoundaryKind | undefined, boolean, readonly string[]][] {
  return sites
    .filter(
      (site) =>
        site.name === name && (kind === undefined || site.kind === kind),
    )
    .map((site) => [site.boundary, site.refused, site.types]);
}

/** `file#owner(name)` of a fixture's site. */
function key(fixture: string, owner: string, name: string): string {
  return `${AT}/${fixture}.ts#${owner}(${name})`;
}

describe('the unknown audit refuses a node that holds unknown', () => {
  it('a typed value held as unknown is refused, with its type', () => {
    assert.deepEqual(judged(sitesOf('typed'), 'order', 'parameter'), [
      [undefined, true, ['Order']],
    ]);
  });

  it('a value laundered through an unknown parameter is refused where it enters, and the next one too', () => {
    const sites = sitesOf('laundered').filter((site) => site.name === 'value');
    assert.deepEqual(
      sites.map((site) => [
        site.where.split('/').pop(),
        site.refused,
        site.types,
      ]),
      [
        ['laundered.ts:7', true, []],
        ['laundered.ts:11', true, ['Order']],
      ],
    );
  });

  it('a site unlisted is refused whatever reaches it: no flow is followed', () => {
    for (const [fixture, name] of [
      ['boundary', 'value'],
      ['awaited', 'value'],
      ['shorthand', 'id'],
      ['narrowedProperty', 'value'],
      ['listByKey', 'value'],
      ['positionFollowed', 'heldReading'],
      ['unnamedSink', 'value'],
    ] as const) {
      const found = sitesOf(fixture).filter((site) => site.name === name);
      assert.ok(found.length > 0, `${fixture}: ${name}`);
      assert.ok(
        found.every((site) => site.refused && site.boundary === undefined),
        `${fixture}: ${name}`,
      );
    }
    assert.deepEqual(judged(sitesOf('unnamedSink'), 'value'), [
      [undefined, true, ['number', 'string']],
    ]);
  });

  it('a parse result listed by exact site passes, the environment reaching it too', () => {
    const sites = sitesOf('boundary', {
      parse: [key('boundary', 'readName', 'value')],
    });
    assert.deepEqual(judged(sites, 'value'), [
      ['parse', false, ['string | undefined']],
    ]);
    // The environment is the program's input: no widening refused.
    assert.deepEqual(
      sites.filter((site) => site.kind === 'widening'),
      [],
    );
  });

  it('a typed value put into a listed parse site is refused where it lands', () => {
    const sites = sitesOf('mixed', { parse: [key('mixed', 'label', 'value')] });
    assert.deepEqual(judged(sites, 'value', 'parameter'), [
      ['parse', false, ['Order']],
    ]);
    assert.deepEqual(
      sites
        .filter((site) => site.kind === 'widening')
        .map((site) => [site.where.split('/').pop(), site.refused, site.types]),
      [['mixed.ts:11', true, ['Order']]],
    );
  });

  it('a caught value is a boundary by its form: a catch binding, a rejection handler', () => {
    assert.deepEqual(judged(sitesOf('boundary'), 'error'), [
      ['caught', false, []],
    ]);
    assert.deepEqual(judged(sitesOf('callback'), 'reason'), [
      ['caught', false, []],
    ]);
    assert.deepEqual(judged(sitesOf('thrownShorthand'), 'rejection'), [
      ['caught', false, []],
    ]);
  });

  it('a reader of thrown values and a failure slot pass only when listed', () => {
    const reader = key('thrownReader', 'describeFailure', 'thrown');
    assert.deepEqual(judged(sitesOf('thrownReader'), 'thrown'), [
      [undefined, true, ['Error']],
    ]);
    assert.deepEqual(
      judged(sitesOf('thrownReader', { thrown: [reader] }), 'thrown'),
      [['thrown', false, ['Error']]],
    );
    const shorthand = sitesOf('thrownShorthand');
    assert.deepEqual(judged(shorthand, 'error', 'property'), [
      [undefined, true, ['Error', 'string']],
    ]);
    assert.deepEqual(judged(shorthand, 'reason', 'property'), [
      [undefined, true, ['string']],
    ]);
    assert.deepEqual(judged(shorthand, 'failure', 'property'), [
      [undefined, true, ['Error']],
    ]);
    const listed = sitesOf('thrownShorthand', {
      thrown: [
        key('thrownShorthand', 'Settled', 'error'),
        key('thrownShorthand', 'Rejected', 'reason'),
        key('thrownShorthand', 'Outcome', 'failure'),
      ],
    });
    assert.deepEqual(
      listed.filter((site) => site.refused).map((site) => site.key),
      [],
    );
    // A property read of a thrown value held as unknown is the reader's.
    const property = sitesOf('thrownProperty', {
      thrown: [
        key('thrownProperty', 'classOf', 'error'),
        key('thrownProperty', 'classOf', 'name'),
      ],
    });
    assert.deepEqual(
      property.filter((site) => site.refused).map((site) => site.key),
      [],
    );
  });

  it('a listed name no site has is stale', () => {
    const reader = key('thrownReader', 'describeFailure', 'thrown');
    const sites = sitesOf('thrownReader', { thrown: [reader] });
    assert.deepEqual(staleEntries(sites, new Set([reader, `${reader}x`])), [
      `${reader}x`,
    ]);
  });

  it("a value of the program's arguments or environment passes in a listed slot", () => {
    assert.deepEqual(judged(sitesOf('programInput'), 'value'), [
      [undefined, true, ['string']],
    ]);
    const sites = sitesOf('programInput', {
      programInput: [
        key('programInput', 'Hit', 'value'),
        key('programInput', 'Flag', 'flag'),
      ],
    });
    assert.deepEqual(
      sites.filter((site) => site.refused).map((site) => site.key),
      [],
    );
  });

  it("a tool's arguments before their schema pass, alone or beside typed members", () => {
    const sites = sitesOf('toolInput');
    assert.deepEqual(judged(sites, 'args'), [['tool-args', false, []]]);
    assert.deepEqual(judged(sites, 'selected'), [['tool-args', false, []]]);
    // A member that holds unknown of its own is a site of its own.
    assert.deepEqual(judged(sites, 'extra'), [[undefined, true, ['string']]]);
  });

  it('a named sink contract passes: its members, what implements it, a listed sink site', () => {
    for (const [fixture, name] of [
      ['namedSink', 'meta'],
      ['literalSink', 'meta'],
      ['answerSerializer', 'payload'],
    ] as const) {
      const found = sitesOf(fixture).filter((site) => site.name === name);
      assert.ok(found.length > 0, fixture);
      assert.ok(
        found.every(
          (site) => site.boundary === 'sink-contract' && !site.refused,
        ),
        fixture,
      );
    }
    // A function a sink hands its value to is a site of its own, refused
    // until listed.
    const line = key('sinkForward', 'line', 'meta');
    assert.deepEqual(
      sitesOf('sinkForward')
        .filter((site) => site.key === line)
        .map((site) => site.refused),
      [true],
    );
    assert.deepEqual(
      sitesOf('sinkForward', { sink: [line] })
        .filter((site) => site.refused)
        .map((site) => site.key),
      [],
    );
  });

  it('a sink slot passes, and the same slot unnamed is refused with what is put there', () => {
    const fixture = `${AT}/sinkSlot.ts`;
    const slots = new Map([['ContentItem.json', `${fixture}#serialize`]]);
    assert.deepEqual(judged(sitesOf('sinkSlot', {}, slots), 'json'), [
      ['sink-slot', false, ['Order']],
    ]);
    assert.deepEqual(judged(sitesOf('sinkSlot', {}, new Map()), 'json'), [
      [undefined, true, ['Order']],
    ]);
  });

  it('a sink slot read by any function but its own reader is refused', () => {
    const file = path.join(FIXTURES, 'sinkSlot.ts');
    const fixture = `${AT}/sinkSlot.ts`;
    const found = sinkSlotReads(
      fixtureProgram([file]),
      new Set([file]),
      new Map([['ContentItem.json', `${fixture}#serialize`]]),
    );
    assert.deepEqual(
      found.reads.map((read) => [read.where.split('/').pop(), read.reader]),
      [
        ['sinkSlot.ts:29', `${fixture}#readBack`],
        ['sinkSlot.ts:30', `${fixture}#readBack`],
        ['sinkSlot.ts:35', `${fixture}#readByKey`],
        ['sinkSlot.ts:42', `${fixture}#readByAssignment`],
      ],
    );
    assert.deepEqual([...found.declared], ['ContentItem.json']);
  });

  it('a callback passes where its contract types the position unknown, and is refused where it has a type', () => {
    assert.deepEqual(judged(sitesOf('callback'), 'value'), [
      ['callback', false, []],
    ]);
    const contract = sitesOf('contractCallback');
    assert.deepEqual(judged(contract, 'carried'), [['callback', false, []]]);
    assert.deepEqual(judged(contract, 'widenedReading'), [
      [undefined, true, ['Order']],
    ]);
    const named = sitesOf('namedCallback');
    assert.deepEqual(judged(named, 'namedValue'), [
      [undefined, true, ['number']],
    ]);
    assert.deepEqual(judged(named, 'revived'), [['callback', false, []]]);
  });

  it("a runtime object of the language's own is its contract, not a position", () => {
    assert.deepEqual(sitesOf('languageObject'), []);
  });

  it('a member written by a quoted key is the member', () => {
    assert.deepEqual(judged(sitesOf('quotedKey'), "'raw-value'", 'property'), [
      [undefined, true, ['number']],
    ]);
  });

  it('a position is read however deep it lies in a finite type', () => {
    const [boxed] = sitesOf('deepBox').filter((site) => site.name === 'boxed');
    assert.deepEqual(
      [boxed?.position, boxed?.refused],
      ['.value.value.value.value.value.value.value', true],
    );
  });

  it('a container of unknown, an alias of it, an instantiation with it are each refused', () => {
    const sites = sitesOf('containers');
    for (const name of [
      'items',
      'bag',
      'pair',
      'map',
      'set',
      'work',
      'visited',
      'aliased',
      'Anything',
      'held',
      'into',
      'slots',
      'members',
      'entries',
      'kept',
      'spread',
      'keys',
      'rows',
      'heldOrders',
      'made',
      'grouped',
      'resolved',
      'listed',
      'table',
      'spreadInto',
      'byNumber',
      'afterSpread',
      'finished',
      'inheritedValues',
      'restItems',
      'spreadMap',
      'spreadSet',
      'listedBags',
      'pendingLists',
      'restAfter',
      'spreadResolved',
    ]) {
      const found = sites.filter((site) => site.name === name);
      assert.ok(found.length > 0, name);
      assert.ok(
        found.every((site) => site.refused),
        name,
      );
    }
    // The typed values that reach them are named.
    for (const name of [
      'items',
      'pair',
      'map',
      'set',
      'work',
      'visited',
      'held',
    ]) {
      assert.deepEqual(
        sites
          .filter((site) => site.name === name)
          .flatMap((site) => site.types),
        ['Order'],
        name,
      );
    }
    // A function type's parameter written unknown, at any depth of an
    // instantiation.
    assert.deepEqual(
      sites
        .filter((site) => site.name === 'visit')
        .map((site) => site.position),
      ['(0)', '(0)[]'],
    );
    // An instantiation the call writes unknown into, no argument bringing it.
    assert.ok(
      sites.some(
        (site) =>
          site.kind === 'expression' &&
          site.name.startsWith('new Set<unknown>'),
      ),
    );
  });

  it('a container of unknown fed from outside passes only as a listed parse site', () => {
    const sites = sitesOf('containerBoundary');
    assert.ok(
      sites
        .filter((site) => site.boundary === undefined)
        .every((site) => site.refused),
    );
    const declared = (site: SweepSite) =>
      !['expression', 'widening', 'any'].includes(site.kind);
    const listed = sitesOf('containerBoundary', {
      parse: sites
        .filter((site) => site.refused && declared(site))
        .map((site) => site.key),
    });
    assert.deepEqual(
      listed
        .filter((site) => site.refused && declared(site))
        .map((site) => site.key),
      [],
    );
    // Listed, a parse site still refuses a typed value put into it: the
    // `number` after the spread reaches the rest.
    assert.deepEqual(
      listed
        .filter((site) => site.kind === 'widening')
        .map((site) => [site.where.split('/').pop(), site.types]),
      [['containerBoundary.ts:54', ['number']]],
    );
  });

  it('a library answer of type any lands only where unknown is expected', () => {
    const lines = sitesOf('untypedAnswer')
      .filter((site) => site.kind === 'any')
      .map((site) => Number(site.where.split(':').pop()));
    for (const refused of [9, 14, 35])
      assert.ok(lines.includes(refused), `${refused}`);
    for (const passes of [21, 30, 41])
      assert.ok(!lines.includes(passes), `${passes}`);
  });

  it("every package's sources are the repository's own, installed and built files are not", () => {
    assert.equal(ownFile(path.join(REPO, 'compact-modify/src/x.ts')), true);
    assert.equal(ownFile(path.join(REPO, 'scripts/x.ts')), true);
    assert.equal(ownFile(path.join(REPO, 'node_modules/a/index.d.ts')), false);
    assert.equal(ownFile(path.join(REPO, 'server-runtime/dist/x.d.ts')), false);
  });

  it('a file is found however its name is spelled', () => {
    const spelled = `${FIXTURES}${path.sep}deeper${path.sep}..${path.sep}typed.ts`;
    const sites = sweepFiles(fixtureProgram([spelled]), new Set([spelled]));
    assert.deepEqual(judged(sites, 'order', 'parameter'), [
      [undefined, true, ['Order']],
    ]);
  });
});

describe('the forms round 8 found the flow scan missing are refused', () => {
  it('a named arrow callback, a named function in a typed list or a shorthand member', () => {
    const sites = sitesOf('namedArrow');
    assert.deepEqual(judged(sites, 'namedArrow'), [
      [undefined, true, ['number']],
    ]);
    for (const name of ['listed', 'checked', 'member', 'inspected']) {
      assert.deepEqual(
        judged(sites, name).map(([boundary, refused]) => [boundary, refused]),
        [[undefined, true]],
        name,
      );
    }
  });

  it('a bracket-key write feeds the member', () => {
    assert.deepEqual(judged(sitesOf('bracketWrite'), 'value', 'property'), [
      [undefined, true, ['number']],
    ]);
    const listed = sitesOf('bracketWrite', {
      parse: [key('bracketWrite', 'Box', 'value')],
    });
    assert.deepEqual(
      listed
        .filter((site) => site.kind === 'widening')
        .map((site) => [site.where.split('/').pop(), site.types]),
      [['bracketWrite.ts:9', ['number']]],
    );
  });

  it('a nested or array assignment pattern reads a sink slot', () => {
    const file = path.join(FIXTURES, 'nestedDestructuring.ts');
    const fixture = `${AT}/nestedDestructuring.ts`;
    const found = sinkSlotReads(
      fixtureProgram([file]),
      new Set([file]),
      new Map([['ContentItem.json', `${fixture}#serialize`]]),
    );
    assert.deepEqual(
      found.reads.map((read) => [read.where.split('/').pop(), read.reader]),
      [
        ['nestedDestructuring.ts:18', `${fixture}#readNested`],
        ['nestedDestructuring.ts:24', `${fixture}#readFromList`],
      ],
    );
  });

  it('a value made by new with no arguments is typed by its class', () => {
    assert.deepEqual(judged(sitesOf('emptyConstructor'), 'value', 'property'), [
      [undefined, true, ['number']],
    ]);
  });

  it("an object literal's method returns into its contract", () => {
    assert.deepEqual(
      judged(sitesOf('literalMethod'), '(anonymous)', 'return'),
      [[undefined, true, ['number']]],
    );
  });
});
