/**
 * Completeness by construction (plan step 9.1, `src/lib/detail/listing.ts`):
 * a terse list is written from the reading's own lists — every item one row
 * or one mark line — and a list of the reading left without a schema, or a
 * schema bound to another list, does not compile.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ITransportObjectEntryList } from '@mcp-abap-adt/adt-strategies';
import {
  entries,
  formatted,
  type JsonSchemas,
  kinds,
  type ListAnswerTable,
  type ListDetailTable,
  marks,
  nest,
  omitting,
  parts,
  partsOf,
  type RowSchemas,
  rawLevel,
  rows,
  sections,
  values,
  type Written,
  whole,
  writeJson,
  writeJsonList,
  writeJsonRoot,
  writeListing,
  writeWhole,
} from '../../../lib/detail';

interface Obj {
  readonly type: string;
  readonly name: string;
  readonly pkg: string;
}
interface Read {
  readonly name: string;
  readonly objects: readonly Obj[];
  readonly notLoaded?: readonly { readonly type: string }[] | undefined;
}

const objects = rows('objects', {
  columns: [
    { name: 'type', cell: (o: Obj) => o.type },
    { name: 'name', cell: (o: Obj) => o.name },
  ],
  header: 'always',
});
const notLoaded = marks(
  'notLoaded',
  'not loaded by SAP',
  (n: { type: string }) => [n.type],
);

/** A reading of `count` objects in packages, and `missing` nodes not loaded. */
function readingOf(count: number, missing: number): Read {
  return {
    name: 'P',
    objects: Array.from({ length: count }, (_, i) => ({
      type: i % 2 === 0 ? 'CLAS/OC' : 'PROG/P',
      name: `Z${i}\t\n${i}`,
      pkg: `PKG${i % 3}`,
    })),
    notLoaded: Array.from({ length: missing }, () => ({ type: 'VIEW/DV' })),
  };
}

describe('writeListing: every item of every list, by construction', () => {
  for (const [count, missing] of [
    [0, 0],
    [1, 0],
    [7, 2],
    [40, 5],
  ] as const) {
    it(`${count} objects and ${missing} nodes not loaded: one line each`, () => {
      const reading = readingOf(count, missing);
      const text = writeListing({
        heads: [{ head: 'package', value: reading.name }],
        reading,
        lists: { objects, notLoaded },
      }).answer;
      const lines = text.split('\n');
      assert.equal(lines[0], '# package P');
      assert.equal(lines[1], 'type\tname');
      assert.equal(
        lines.filter((line) => !line.startsWith('#') && line !== 'type\tname')
          .length,
        count,
      );
      assert.equal(
        lines.filter((line) => line.startsWith('# not loaded by SAP')).length,
        missing,
      );
    });
  }

  it('gathered groups: every item under its value, values in first-appearance order', () => {
    const reading = readingOf(5, 0);
    const text = writeListing({
      heads: [],
      reading,
      lists: {
        objects: rows('objects', {
          columns: [{ name: 'name', cell: (o: Obj) => o.name }],
          header: 'none',
          groups: [
            { label: 'package', of: (o: Obj) => o.pkg, mode: 'gathered' },
          ],
        }),
        notLoaded,
      },
    }).answer;
    assert.equal(
      text,
      [
        '# package PKG0',
        'Z0\\t\\n0',
        'Z3\\t\\n3',
        '# package PKG1',
        'Z1\\t\\n1',
        'Z4\\t\\n4',
        '# package PKG2',
        'Z2\\t\\n2',
      ].join('\n'),
    );
  });

  it('run groups: an inner group starts again with its outer one', () => {
    type E = {
      readonly task: string;
      readonly pgmid: string;
      readonly name: string;
    };
    const reading = {
      entries: [
        { task: 'T1', pgmid: 'R3TR', name: 'A' },
        { task: 'T1', pgmid: 'R3TR', name: 'B' },
        { task: 'T2', pgmid: 'R3TR', name: 'C' },
        { task: 'T2', pgmid: 'LIMU', name: 'D' },
      ],
    };
    const text = writeListing({
      heads: [],
      reading,
      lists: {
        entries: rows('entries', {
          columns: [{ name: 'name', cell: (e: E) => e.name }],
          header: 'none',
          groups: [
            { label: 'task', of: (e: E) => e.task, mode: 'run' },
            { label: 'pgmid', of: (e: E) => e.pgmid, mode: 'run' },
          ],
        }),
      },
    }).answer;
    assert.equal(
      text,
      '# task T1\n# pgmid R3TR\nA\nB\n# task T2\n# pgmid R3TR\nC\n# pgmid LIMU\nD',
    );
  });

  it('a tree: one root, every node at its depth, depth first', () => {
    type N = {
      readonly name: string;
      readonly children?: readonly N[] | undefined;
    };
    const tree: RowSchemas<N> = {
      children: rows('children', {
        columns: [{ name: 'name', cell: (n: N) => n.name }],
        header: 'none',
        get lists() {
          return tree;
        },
      }),
    };
    const text = writeListing({
      heads: [],
      reading: {
        name: 'ROOT',
        children: [{ name: 'a', children: [{ name: '#b' }] }, { name: 'c' }],
      },
      lists: tree,
      root: { columns: [{ name: 'name', cell: (n: N) => n.name }] },
    }).answer;
    assert.equal(text, 'ROOT\n  a\n    \\#b\n  c');
  });

  it('sections and kinds: each item by its own spec', () => {
    type Part =
      | {
          readonly kind: 'answered';
          readonly name: string;
          readonly rows: readonly string[];
        }
      | {
          readonly kind: 'failed';
          readonly name: string;
          readonly rows?: undefined;
        };
    const reading: { parts: readonly Part[] } = {
      parts: [
        { kind: 'answered', name: 'A', rows: ['a1', 'a2'] },
        { kind: 'failed', name: 'B' },
      ],
    };
    const text = writeListing({
      heads: [],
      reading,
      lists: {
        parts: kinds<Part, 'parts', 'kind'>('parts', 'kind', {
          answered: {
            heads: (p: Part) => [{ head: 'asked', value: p.name }],
            lists: {
              rows: rows('rows', {
                columns: [{ name: 'v', cell: (v: string) => v }],
                header: 'none',
              }),
            },
          },
          failed: {
            mark: 'error',
            words: (p: Part) => [p.name],
          },
        }),
      },
    }).answer;
    assert.equal(text, '# asked A\na1\na2\n# error\tB');
    const sectioned = writeListing({
      heads: [],
      reading,
      lists: {
        parts: sections(
          'parts',
          (p: Part) => [{ head: 'asked', value: p.name }],
          {
            rows: rows('rows', {
              columns: [{ name: 'v', cell: (v: string) => v }],
              header: 'none',
            }),
          },
        ),
      },
    }).answer;
    assert.equal(sectioned, '# asked A\na1\na2\n# asked B');
  });

  it('a list of the reading left without a schema does not compile', () => {
    const reading = readingOf(1, 1);
    // @ts-expect-error `notLoaded` is a list of the reading and has no schema.
    writeListing({ heads: [], reading, lists: { objects } });
  });

  it('a schema bound to another list does not compile', () => {
    const reading = readingOf(1, 1);
    writeListing({
      heads: [],
      reading,
      // @ts-expect-error the `notLoaded` key holds a schema of `objects`.
      lists: { objects, notLoaded: objects },
    });
  });

  it('a kind left without its spec does not compile', () => {
    type P = { readonly kind: 'answered' } | { readonly kind: 'failed' };
    // @ts-expect-error `failed` has no spec.
    kinds<P, 'parts', 'kind'>('parts', 'kind', {
      answered: { mark: 'ok', words: () => [] },
    });
  });
});

// Codex round 10, P1-2 and P1-3: every hole of the schemas is a compile
// error, or — two outputs under one name — refused when written.
// Codex round 11: children cannot be dropped through optional options, a
// list at any depth or in a record needs its schema, an opaque member does
// not compile, and a JSON name is any name.
// Codex round 12: a part writes one member, `nest` takes no list as its
// reading, `kinds` needs a union of arms, and a reading's scalar-or-array
// members and its depth are checked where it reaches a writer.
describe('round 12: no item misses the output', () => {
  type Listed = { readonly name: string; readonly kids: readonly string[] };
  type Two = {
    readonly name: string;
    readonly primary?: Listed | undefined;
    readonly secondary?: Listed | undefined;
  };
  const listedListing = (value: Listed) => ({
    heads: [],
    reading: value,
    lists: {
      kids: marks('kids', 'kid', (kid: string) => [kid]),
    },
  });

  it('a part writes one member: a union selector does not compile', () => {
    const either = (): 'primary' | 'secondary' => 'primary';
    partsOf(
      'items',
      (item: Two) => [{ head: 'item', value: item.name }],
      // @ts-expect-error a union of members is no one member.
      either(),
      (value: Listed) => nest(listedListing(value)),
    );
  });

  it('every member holding lists needs a part of its own', () => {
    const schemas: RowSchemas<{ items: readonly Two[] }> = {
      // @ts-expect-error `secondary` holds lists no part writes.
      items: partsOf(
        'items',
        (item: Two) => [{ head: 'item', value: item.name }],
        'primary',
        (value) => nest(listedListing(value)),
      ),
    };
    void schemas;
  });

  it('nest takes no list as its reading', () => {
    nest({
      heads: [],
      reading: ['a', 'b'],
      // @ts-expect-error a list has no member a schema is bound to.
      lists: {},
    });
  });

  it('kinds cannot drop the lists of a discriminant that is a union on one object type', () => {
    type OneType = {
      readonly kind: 'a' | 'b';
      readonly children: readonly string[];
    };
    kinds<OneType, 'items', 'kind'>('items', 'kind', {
      // @ts-expect-error an item of kind `a` holds `children`: no mark line.
      a: { mark: 'a', words: () => [] },
      // @ts-expect-error nor for kind `b`.
      b: { mark: 'b', words: () => [] },
    });
  });

  it('kinds counts a wider arm beside an exact one: its child list cannot be dropped', () => {
    type Mixed =
      | { readonly kind: 'a'; readonly name: string }
      | { readonly kind: string; readonly children: readonly string[] };
    kinds<Mixed, 'items', 'kind'>('items', 'kind', {
      // @ts-expect-error an item of kind `a` may be the wider arm, with children.
      a: { mark: 'a', words: () => [] },
    });
  });

  it('a reading that is a list on any arm of a union does not compile', () => {
    type Either = { readonly items: readonly string[] } | readonly string[];
    // @ts-expect-error one arm is a list: no schema is bound to a list.
    const schemas: RowSchemas<Either> = {};
    void schemas;
  });

  it('a part of an item that is an object or a list does not compile', () => {
    type Item =
      | { readonly kids: readonly string[] }
      | readonly { readonly kids: readonly string[] }[];
    parts(
      'items',
      () => [],
      (item: Item) =>
        nest({
          heads: [],
          reading: item,
          // @ts-expect-error an item that may be a list has no schemas.
          lists: { kids: marks('kids', 'kid', (kid: string) => [kid]) },
        }),
    );
  });

  it('a union with one refused arm does not compile', () => {
    type Either =
      | { readonly items: readonly string[] }
      | { readonly items: readonly string[]; readonly extra: unknown };
    // @ts-expect-error the second arm holds `unknown`.
    const schemas: RowSchemas<Either> = {
      items: marks('items', 'item', (item: string) => [item]),
    };
    void schemas;
  });

  it('a narrower type met on the way down is checked in its own right', () => {
    type Node = {
      readonly name: string;
      readonly parent?: Node | undefined;
      readonly special?: (Node & { readonly extra: unknown }) | undefined;
    };
    // @ts-expect-error `special` is a narrower Node, holding `unknown`.
    const schemas: RowSchemas<{ readonly node: Node }> = {};
    void schemas;
  });

  it('a member that may be any JSON value holding a list of the reading does not compile', () => {
    type Mixed = {
      readonly items: readonly { name: string }[];
      readonly extra:
        | string
        | number
        | boolean
        | null
        | readonly {
            readonly name: string;
            readonly kids: readonly string[];
          }[];
    };
    // @ts-expect-error the list in `extra` is hidden among scalars.
    const schemas: RowSchemas<Mixed> = {
      items: rows('items', {
        columns: [{ name: 'name', cell: (o: { name: string }) => o.name }],
        header: 'none',
      }),
    };
    void schemas;
  });

  it('a reading nesting past the depth cap does not compile', () => {
    type Leaf = { readonly items: readonly { name: string }[] };
    type Deep = {
      readonly a: {
        readonly b: {
          readonly c: {
            readonly d: {
              readonly e: {
                readonly f: {
                  readonly g: { readonly h: { readonly i: Leaf } };
                };
              };
            };
          };
        };
      };
    };
    // @ts-expect-error nine objects down: refused rather than unchecked.
    const schemas: JsonSchemas<Deep> = {};
    void schemas;
  });

  it("a tool's real reading, mutated, does not compile", () => {
    type Mutated = ITransportObjectEntryList & {
      readonly extra: string | number | boolean | null | readonly Two[];
    };
    // @ts-expect-error the mutated member hides a list among scalars.
    const schemas: JsonSchemas<Mutated> = {
      entries: values('entries', () => ''),
      incompleteEntries: values('incompleteEntries', () => ''),
    };
    void schemas;
  });
});

describe('round 11: no item misses the output', () => {
  type Lost = {
    readonly a: readonly { readonly children: readonly string[] }[];
  };
  const lost: Lost = { a: [{ children: ['lost'] }] };

  it("entries without its item's child lists does not compile", () => {
    const schemas: JsonSchemas<Lost> = {
      // @ts-expect-error the items hold `children`, which nothing writes.
      a: entries('a', () => ({})),
    };
    void schemas;
    // @ts-expect-error the options and their child schema are required.
    entries('a', (item: Lost['a'][number]) => ({ n: item.children.length }));
  });

  it('values and marks refuse items holding lists', () => {
    const json: JsonSchemas<Lost> = {
      // @ts-expect-error a value writes no list of its item.
      a: values('a', (item: Lost['a'][number]) => item.children.length),
    };
    const terse: RowSchemas<Lost> = {
      // @ts-expect-error a mark line writes no list of its item.
      a: marks('a', 'a', (item: Lost['a'][number]) => [
        String(item.children.length),
      ]),
    };
    void json;
    void terse;
  });

  it('a child schema writes every child', () => {
    const answer = writeJsonList(
      lost,
      entries('a', (_item: Lost['a'][number]) => ({}), {
        lists: { children: values('children', (child: string) => child) },
      }),
    ).answer;
    assert.deepStrictEqual(answer, [{ children: ['lost'] }]);
  });

  it('a record of lists needs a schema: none can be given', () => {
    type Grouped = {
      readonly groups: Readonly<Record<string, readonly { name: string }[]>>;
    };
    // @ts-expect-error a record of lists has no schema.
    const schemas: RowSchemas<Grouped> = {};
    void schemas;
  });

  it('a list at any depth needs its schema', () => {
    type Deep = {
      readonly outer: {
        readonly inner: { readonly items: readonly { name: string }[] };
      };
    };
    // @ts-expect-error `outer` holds a list two objects down.
    const schemas: RowSchemas<Deep> = {};
    // @ts-expect-error and so for JSON.
    const json: JsonSchemas<Deep> = {};
    void schemas;
    void json;
  });

  it('a member typed unknown or any does not compile in a listing', () => {
    type Opaque = {
      readonly items: readonly { name: string }[];
      readonly extra: unknown;
    };
    // @ts-expect-error a reading holding `unknown` has no schemas at all.
    const schemas: RowSchemas<Opaque> = {
      items: rows('items', {
        columns: [{ name: 'name', cell: (o: { name: string }) => o.name }],
        header: 'none',
      }),
    };
    void schemas;
  });

  it('a JSON list named __proto__ is a member like any other', () => {
    const reading = { a: [{ name: 'x' }] };
    const answer = writeJson({}, reading, {
      a: entries('a', (o: { name: string }) => ({ name: o.name }), {
        as: '__proto__',
      }),
    }).answer;
    assert.equal(JSON.stringify(answer), '{"__proto__":[{"name":"x"}]}');
    assert.equal(Object.getPrototypeOf(answer), Object.prototype);
  });

  it('writeWhole takes a reading object, never a primitive', () => {
    // @ts-expect-error a string is no reading.
    writeWhole('a document');
  });
});

describe('the schemas leave no hole', () => {
  const objects = rows('objects', {
    columns: [{ name: 'name', cell: (o: { name: string }) => o.name }],
    header: 'none',
  });

  it('a list beside false needs its schema', () => {
    const reading: {
      objects: readonly { name: string }[];
      more: readonly { name: string }[] | false;
    } = { objects: [], more: false };
    // @ts-expect-error `more` is a list (or false) and has no schema.
    writeListing({ heads: [], reading, lists: { objects } });
  });

  it('a list on one arm of a union needs its schema', () => {
    type Arms =
      | { kind: 'a'; objects: readonly { name: string }[] }
      | { kind: 'b'; others: readonly { name: string }[] };
    const armOf = (): Arms => ({ kind: 'a', objects: [] });
    const reading = armOf();
    // @ts-expect-error `others` is a list on one arm and has no schema.
    writeListing({ heads: [], reading, lists: { objects } });
  });

  it('a list under a nested object needs its schema', () => {
    const reading: {
      objects: readonly { name: string }[];
      inner: { deeper: readonly { name: string }[] };
    } = { objects: [], inner: { deeper: [] } };
    // @ts-expect-error `inner` holds a list and has no schema.
    writeListing({ heads: [], reading, lists: { objects } });
  });

  it('a Map or a Set cannot be written at all', () => {
    const reading: {
      objects: readonly { name: string }[];
      byName: Map<string, string>;
    } = { objects: [], byName: new Map() };
    // @ts-expect-error a Map has no schema that writes it.
    writeListing({ heads: [], reading, lists: { objects } });
  });

  it("a tree item's child list is required", () => {
    type N = { readonly name: string; readonly children: readonly N[] };
    // @ts-expect-error `lists` is required: the item holds `children`.
    rows('children', {
      columns: [{ name: 'name', cell: (n: N) => n.name }],
      header: 'none',
    });
    entries(
      'children',
      (n: N) => ({ name: n.name }),
      // @ts-expect-error `lists` is required in a JSON entry too.
      {},
    );
  });

  it('writeJsonList takes the one list of its reading', () => {
    const reading = { a: [{ n: 'x' }], b: [{ n: 'y' }] };
    writeJsonList(
      // @ts-expect-error the reading holds two lists.
      reading,
      entries('a', (i: { n: string }) => i),
    );
  });

  it('two JSON lists under one name are refused when written', () => {
    const reading = { a: [{ n: 'x' }], b: [{ n: 'y' }] };
    assert.throws(
      () =>
        writeJson({}, reading, {
          a: entries('a', (i: { n: string }) => i, { as: 'same' }),
          b: entries('b', (i: { n: string }) => i, { as: 'same' }),
        }),
      /one name/,
    );
  });

  it('a binding is made by the factories alone', () => {
    const reading = { objects: [{ name: 'A' }] };
    writeListing({
      heads: [],
      reading,
      // @ts-expect-error a plain object is no binding: it could write nothing.
      lists: { objects: { key: 'objects', write: () => [] } },
    });
  });

  it('a plain answer is no written answer', () => {
    // @ts-expect-error `Written` is nominal.
    const forged: Written<string> = { answer: 'plain' };
    void forged;
  });

  it('a list table takes no plain answer at terse or medium', () => {
    const table: ListAnswerTable<string, string> = {
      // @ts-expect-error a plain string is no written answer.
      terse: (value: string) => value,
      // @ts-expect-error nor at medium.
      medium: (value: string) => value,
      full: (value: string) => value,
      raw: (value: string) => value,
    };
    const readings: ListDetailTable<string> = {
      // @ts-expect-error a formatter's own value is no written level.
      terse: formatted(
        (answer) => String(answer.data),
        (value) => value,
      ),
      medium: whole(rawLevel),
      full: rawLevel,
      raw: rawLevel,
    };
    void table;
    void readings;
  });

  it("a kind is the item's own discriminant, never a constant", () => {
    type P = { readonly name: string };
    // @ts-expect-error `name` is any string, no discriminant.
    kinds<P, 'parts', 'name'>('parts', 'name', {});
  });
});

describe('writeJson: every item of every list one entry, by construction', () => {
  type Part = {
    readonly name: string;
    readonly items?: readonly { readonly n: string }[] | undefined;
  };
  const reading = {
    parts: [{ name: 'A', items: [{ n: 'a1' }, { n: 'a2' }] }, { name: 'B' }],
  };
  const parts = entries('parts', (p: Part) => ({ package_name: p.name }), {
    as: 'packages',
    lists: {
      items: entries('items', (i: { n: string }) => ({ name: i.n }), {
        as: 'objects',
      }),
    },
  });

  it('nested lists under their names; an absent list writes no member', () => {
    assert.deepStrictEqual(
      writeJson({ total: 2 }, reading, { parts }, { parts: 'replaced?' })
        .answer,
      {
        total: 2,
        packages: [
          { package_name: 'A', objects: [{ name: 'a1' }, { name: 'a2' }] },
          { package_name: 'B' },
        ],
        parts: 'replaced?',
      },
    );
    assert.deepStrictEqual(writeJsonList(reading, parts).answer, [
      { package_name: 'A', objects: [{ name: 'a1' }, { name: 'a2' }] },
      { package_name: 'B' },
    ]);
  });

  it('after cannot replace a list', () => {
    const answer = writeJson(
      {},
      reading,
      { parts },
      // @ts-expect-error a list beside the lists does not compile at all.
      { packages: [] },
    ).answer;
    assert.ok(Array.isArray(answer.packages));
  });

  it('no list reaches the answer but through its schema', () => {
    // @ts-expect-error a list in the facts beside the reading's lists.
    writeJson({ projected: [{ name: 'A' }] }, reading, { parts });
    entries(
      'parts',
      // @ts-expect-error an entry holding a list of its own making.
      (part: { name: string }) => ({ name: part.name, kept: [part.name] }),
    );
  });

  it('a list without a JSON schema does not compile', () => {
    // @ts-expect-error `parts` is a list of the reading and has no schema.
    writeJson({}, reading, {});
  });
});

describe('nested listings, conditional cells, JSON trees', () => {
  type N = {
    readonly name: string;
    readonly children?: readonly N[] | undefined;
  };
  const tree: RowSchemas<N> = {
    children: rows('children', {
      columns: [
        { name: 'name', cell: (n: N) => n.name },
        { name: 'uri', cell: () => '/u', when: (n: N) => n.name === '' },
      ],
      header: 'none',
      get lists() {
        return tree;
      },
    }),
  };
  const listingOf = (root: N) => ({
    heads: [],
    reading: root,
    root: { columns: [{ name: 'name', cell: (n: N) => n.name }] },
    lists: tree,
  });

  it('parts: each part its heads, then its own nested listing', () => {
    type Asked = { readonly name: string; readonly tree?: N | undefined };
    const text = writeListing({
      heads: [],
      reading: {
        asked: [
          { name: 'A', tree: { name: 'A', children: [{ name: '' }] } },
          { name: 'B' },
        ],
      },
      lists: {
        asked: partsOf(
          'asked',
          (a: Asked) => [{ head: 'asked', value: a.name }],
          'tree',
          (tree) => nest(listingOf(tree)),
        ),
      },
    }).answer;
    assert.equal(text, '# asked A\nA\n  \t/u\n# asked B');
  });

  it('writeJsonRoot: a leaf without its empty children where asked', () => {
    type M = {
      readonly name: string;
      readonly children?: readonly M[] | undefined;
    };
    const schemas: JsonSchemas<M> = {
      children: entries('children', (m: M) => ({ name: m.name }), {
        omitEmpty: true,
        get lists() {
          return schemas;
        },
      }),
    };
    assert.deepStrictEqual(
      writeJsonRoot(
        { name: 'R', children: [{ name: 'a', children: [] }, { name: 'b' }] },
        (m: M) => ({ name: m.name }),
        schemas,
      ).answer,
      { name: 'R', children: [{ name: 'a' }, { name: 'b' }] },
    );
  });
});

describe('omit: a kind the shape leaves out, stated with its reason', () => {
  type R = { readonly name: string; readonly usage?: string | undefined };
  const reading = {
    refs: [
      { name: 'NODE' },
      { name: 'A', usage: '' },
      { name: 'B', usage: 'x' },
    ],
  };
  it('rows: every item visited, only the omitted kind writes no row', () => {
    const text = writeListing({
      heads: [],
      reading,
      lists: {
        refs: rows('refs', {
          columns: [{ name: 'name', cell: (r: R) => r.name }],
          header: 'none',
          omit: omitting((r: R) => (r.usage === undefined ? 'node' : 'usage'), {
            node: 'no usage',
          }),
        }),
      },
    }).answer;
    assert.equal(text, 'A\nB');
  });
  it('kinds: an omit spec writes nothing for its kind', () => {
    type K =
      | { readonly kind: 'node'; readonly name: string }
      | { readonly kind: 'usage'; readonly name: string };
    const kinded: { refs: readonly K[] } = {
      refs: [
        { kind: 'node', name: 'NODE' },
        { kind: 'usage', name: 'A' },
        { kind: 'usage', name: 'B' },
      ],
    };
    const text = writeListing({
      heads: [],
      reading: kinded,
      lists: {
        refs: kinds<K, 'refs', 'kind'>('refs', 'kind', {
          node: { omit: 'no usage' },
          usage: { mark: 'ref', words: (r: K) => [r.name] },
        }),
      },
    }).answer;
    assert.equal(text, '# ref\tA\n# ref\tB');
  });
});
