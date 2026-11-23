/**
 * Plan step 10.5: a tool's description and its output, tied
 * (`returnsMatch.ts`). The writer tools are tied as each moves (group (2) of
 * step 10.7); until then each is listed in `NOT_YET_ASSEMBLED`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { returnsOf } from '../../../lib/description';
import {
  about,
  entries,
  headShape,
  type JsonSchemas,
  jsonShapesOf,
  kinds,
  marks,
  type RowSchemas,
  rows,
  shapesOf,
  writeJson,
  writtenLines,
} from '../../../lib/detail';
import { NOT_YET_ASSEMBLED, WRITER_TOOLS } from './notYetAssembled';
import { type ReturnsTie, tieFaults } from './returnsMatch';

/** The writer tools tied so far, by name (group (2) fills this). */
const TIED: Readonly<Record<string, () => ReturnsTie>> = {};

type Item = { readonly name: string; readonly type: string };
type Line =
  | { readonly kind: 'row'; readonly name: string }
  | { readonly kind: 'gone'; readonly name: string };
type Reading = {
  readonly objects: readonly Item[];
  readonly gone: readonly string[];
  readonly lines: readonly Line[];
};
const columns = [
  { name: 'type', means: 'its type', cell: (o: Item) => o.type },
  { name: 'name', means: 'its name', cell: (o: Item) => o.name },
];
const terse: RowSchemas<Reading> = {
  objects: about(
    'for each object',
    rows('objects', { columns, header: 'always' }),
  ),
  gone: about(
    'the objects SAP could not load',
    marks('gone', 'not_loaded', (name: string) => [name]),
  ),
  lines: about(
    'for each line kind',
    kinds<Line, 'lines', 'kind'>('lines', 'kind', {
      row: {
        row: {
          columns: [
            { name: 'line', means: 'its line', cell: (l: Line) => l.name },
          ],
          header: 'none',
        },
      },
      gone: { mark: 'gone_line', words: (l: Line) => [l.name] },
    }),
  ),
};
const medium: JsonSchemas<Reading> = {
  objects: about(
    'for each object',
    entries('objects', (o: Item) => o),
  ),
  gone: about(
    'the objects SAP could not load',
    entries('gone', (name: string) => ({ name })),
  ),
  lines: about(
    'for each line kind',
    entries('lines', (l: Line) => ({ name: l.name })),
  ),
};
const head = headShape('package', 'the package read');
const reading: Reading = {
  objects: [{ name: 'ZCL', type: 'CLAS/OC' }],
  gone: ['ZX'],
  lines: [
    { kind: 'row', name: 'L1' },
    { kind: 'gone', name: 'L2' },
  ],
};
const sampleOf = (value: Reading, lists: RowSchemas<Reading> = terse) => ({
  reading: value,
  lines: writtenLines({
    heads: [{ head: 'package', value: 'ZPKG' }],
    reading: value,
    lists,
  }),
});
const tie = (overrides: Partial<ReturnsTie> = {}): ReturnsTie => ({
  terse: shapesOf<Reading>(terse),
  medium: jsonShapesOf<Reading>(medium),
  heads: [head],
  returns: returnsOf({
    heads: [head],
    shapes: [shapesOf<Reading>(terse), jsonShapesOf<Reading>(medium)],
  }),
  samples: [
    {
      ...sampleOf(reading),
      medium: writeJson({}, reading, medium).answer,
    },
  ],
  ...overrides,
});

describe('a tool description tied to what its writers write', () => {
  it('holds when every list, kind, column, head and mark is reached and named', () => {
    assert.deepStrictEqual(tieFaults(tie()), []);
  });

  it('fails on an extra fact, and on a fact left out', () => {
    const [first, ...rest] = tie().returns;
    assert.ok(first !== undefined);
    assert.ok(
      tieFaults(tie({ returns: rest })).some((f) =>
        f.startsWith('a fact left out'),
      ),
    );
    assert.ok(
      tieFaults(
        tie({ returns: [...tie().returns, ...rest.slice(0, 0), first] }),
      ).length === 0,
    );
  });

  it('fails on a written head no schema declares', () => {
    assert.ok(
      tieFaults(tie({ heads: [] })).some((f) =>
        f.includes('an undeclared head: "package"'),
      ),
    );
  });

  it('fails on a written header its schemas do not declare', () => {
    const faults = tieFaults(tie({ terse: shapesOf<Reading>(terse).slice(1) }));
    assert.ok(
      faults.includes('an undeclared header: "type\tname"'),
      faults.join('\n'),
    );
  });

  it('fails on a kind row without the noun of its column', () => {
    const bare: RowSchemas<Reading> = {
      ...terse,
      lines: about(
        'for each line kind',
        kinds<Line, 'lines', 'kind'>(
          'lines',
          'kind',
          {
            row: {
              row: {
                columns: [{ name: 'line', cell: (l: Line) => l.name }],
                header: 'none',
              },
            },
            gone: { mark: 'gone_line', words: (l: Line) => [l.name] },
          },
          ['line'],
        ),
      ),
    };
    const faults = tieFaults(
      tie({
        terse: shapesOf<Reading>(bare),
        samples: [sampleOf(reading, bare)],
      }),
    );
    assert.ok(
      faults.includes('the column "line" is written without its noun'),
      faults.join('\n'),
    );
  });

  it('fails on a medium list under an undeclared name', () => {
    const faults = tieFaults(
      tie({
        samples: [
          { ...sampleOf(reading), medium: { stray: [1], objects: [] } },
        ],
      }),
    );
    assert.ok(
      faults.includes('the medium list "stray" is under no declared name'),
      faults.join('\n'),
    );
  });

  it('fails on a list and a kind no fixture reaches', () => {
    const faults = tieFaults(
      tie({
        samples: [
          sampleOf({
            objects: reading.objects,
            gone: [],
            lines: [{ kind: 'row', name: 'L1' }],
          }),
        ],
      }),
    );
    assert.ok(
      faults.includes('no fixture reaches the list "gone"'),
      faults.join('\n'),
    );
    assert.ok(
      faults.includes('no fixture reaches the kind "lines/gone"'),
      faults.join('\n'),
    );
  });
});

describe('every writer tool is tied, or still listed as not yet assembled', () => {
  for (const tool of WRITER_TOOLS) {
    it(tool, () => {
      const tied = TIED[tool];
      if (tied === undefined) {
        assert.ok(
          NOT_YET_ASSEMBLED.has(tool),
          `${tool} is neither tied nor listed`,
        );
        return;
      }
      assert.ok(
        !NOT_YET_ASSEMBLED.has(tool),
        `${tool} is tied and still listed`,
      );
      assert.deepStrictEqual(tieFaults(tied()), []);
    });
  }
});
