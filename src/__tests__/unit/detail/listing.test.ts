/**
 * Completeness by construction (plan step 9.1, `src/lib/detail/listing.ts`):
 * a terse list is written from the reading's own lists — every item one row
 * or one mark line — and a list of the reading left without a schema, or a
 * schema bound to another list, does not compile.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  entries,
  kinds,
  marks,
  type RowSchemas,
  rows,
  sections,
  writeJson,
  writeJsonList,
  writeListing,
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
    type Part = {
      readonly ok: boolean;
      readonly name: string;
      readonly rows: readonly string[];
    };
    const reading = {
      parts: [
        { ok: true, name: 'A', rows: ['a1', 'a2'] },
        { ok: false, name: 'B', rows: [] },
      ],
    };
    const text = writeListing({
      heads: [],
      reading,
      lists: {
        parts: kinds('parts', (p: Part) => (p.ok ? 'answered' : 'failed'), {
          answered: {
            heads: (p: Part) => [{ head: 'asked', value: p.name }],
            lists: {
              rows: rows('rows', {
                columns: [{ name: 'v', cell: (v: string) => v }],
                header: 'none',
              }),
            },
          },
          failed: { mark: 'error', words: (p: Part) => [p.name] },
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
    // @ts-expect-error `failed` has no spec.
    kinds('parts', (p: { ok: boolean }) => (p.ok ? 'answered' : 'failed'), {
      answered: { mark: 'ok', words: () => [] },
    });
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
    const answer = writeJson({}, reading, { parts }, { packages: [] }).answer;
    assert.equal(answer.packages?.length, 2);
  });

  it('a list without a JSON schema does not compile', () => {
    // @ts-expect-error `parts` is a list of the reading and has no schema.
    writeJson({}, reading, {});
  });
});
