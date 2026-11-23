/**
 * Plan step 10.5: a tool's description and its output, tied
 * (`returnsMatch.ts`). The writer tools are tied as each moves (group (2) of
 * step 10.7); until then each is listed in `NOT_YET_ASSEMBLED`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { returnsOf, statedReturns } from '../../../lib/description';
import {
  about,
  marks,
  type RowSchemas,
  rows,
  shapesOf,
  writeListing,
} from '../../../lib/detail';
import { NOT_YET_ASSEMBLED, WRITER_TOOLS } from './notYetAssembled';
import { type ReturnsTie, tieFaults } from './returnsMatch';

/** The writer tools tied so far, by name (group (2) fills this). */
const TIED: Readonly<Record<string, () => ReturnsTie>> = {};

describe('a tool description tied to what its writer writes', () => {
  type Item = { readonly name: string; readonly type: string };
  type Reading = {
    readonly objects: readonly Item[];
    readonly gone: readonly string[];
  };
  const columns = [
    { name: 'type', means: 'its type', cell: (o: Item) => o.type },
    { name: 'name', means: 'its name', cell: (o: Item) => o.name },
  ];
  const schemas: RowSchemas<Reading> = {
    objects: about(
      'for each object',
      rows('objects', { columns, header: 'always' }),
    ),
    gone: about(
      'the objects SAP could not load',
      marks('gone', 'not_loaded', (name: string) => [name]),
    ),
  };
  const text = writeListing({
    heads: [{ head: 'package', value: 'ZPKG' }],
    reading: { objects: [{ name: 'ZCL', type: 'CLAS/OC' }], gone: ['ZX'] },
    lists: schemas,
  }).answer;
  const tie = (overrides: Partial<ReturnsTie> = {}): ReturnsTie => ({
    shapes: shapesOf<Reading>(schemas),
    heads: { package: 'the package read' },
    returns: [
      statedReturns('the package read'),
      ...returnsOf({ shapes: [shapesOf<Reading>(schemas)] }),
    ],
    texts: [text],
    ...overrides,
  });

  it('holds when every written column, mark and head is named by its noun', () => {
    assert.deepStrictEqual(tieFaults(tie()), []);
  });

  it('fails on a written column the Returns does not name', () => {
    const faults = tieFaults(
      tie({ returns: [statedReturns('the package read')] }),
    );
    assert.ok(
      faults.some((fault) => fault.startsWith('the column "type" is written')),
      faults.join('\n'),
    );
  });

  it('fails on a noun the Returns names and no text writes', () => {
    const faults = tieFaults(tie({ texts: ['# package ZPKG'] }));
    assert.ok(
      faults.some((fault) =>
        fault.includes('no text writes the column "name"'),
      ),
      faults.join('\n'),
    );
  });

  it('fails on a written head no schema declares', () => {
    const faults = tieFaults(tie({ heads: {} }));
    assert.ok(
      faults.includes('"package" is written, and no schema declares it'),
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
