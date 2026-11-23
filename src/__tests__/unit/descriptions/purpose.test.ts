/**
 * Plan step 10.4: a tool's description is assembled — its purpose (the
 * function, the main part), then the facts of what it gives back, then its
 * notes — and every purpose and every fact keeps to the rules of
 * `descriptionRules.ts`. Every tool every binary serves is either assembled
 * or still listed in `NOT_YET_ASSEMBLED`, never both.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import { servedDescription } from '../../../embeddable/BaseMcpServer';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import {
  batchable,
  longRunning,
  partsOfDescription,
  purpose,
  returnsOf,
  toolDescription,
} from '../../../lib/description';
import {
  about,
  marks,
  type RowSchemas,
  rows,
  shapesOf,
} from '../../../lib/detail';
import { LEVEL_SENTENCES, levelWords } from '../../../lib/strategies/detail';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { type Listing, listBinaries } from '../../helpers/servedTools';
import {
  detailFaults,
  FORM_MARKERS,
  factFaults,
  noteFaults,
  PURPOSE_LIMIT,
  purposeFaults,
  TAGS,
} from './descriptionRules';
import { NOT_YET_ASSEMBLED } from './notYetAssembled';

/** A member of a listed schema (outside the type system), or none. */
function memberOf(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

describe('the purpose rules', () => {
  it('takes one sentence of the function, in domain words', () => {
    assert.deepStrictEqual(
      purposeFaults('Reads the objects a package holds, with their types.'),
      [],
    );
  });

  it(`refuses a purpose longer than ${PURPOSE_LIMIT} characters`, () => {
    const long = `${'a'.repeat(PURPOSE_LIMIT)}.`;
    assert.ok(purposeFaults(long).some((fault) => fault.startsWith('longer')));
    assert.deepStrictEqual(
      purposeFaults(`${'a'.repeat(PURPOSE_LIMIT - 1)}.`),
      [],
    );
  });

  it('refuses two sentences, and one without its full stop', () => {
    assert.ok(
      purposeFaults('Reads a class. Writes it too.').includes(
        'holds more than one sentence',
      ),
    );
    assert.ok(
      purposeFaults('Reads a class').includes('does not end with a full stop'),
    );
  });

  for (const marker of FORM_MARKERS) {
    it(`refuses the marker "${marker}" in a purpose and in a fact`, () => {
      const text = `Reads the ${marker} of a class.`;
      assert.ok(purposeFaults(text).includes(`says "${marker}"`), text);
      assert.ok(factFaults(text).includes(`says "${marker}"`), text);
    });
  }

  it('refuses ".." and a line break inside the sentence', () => {
    assert.ok(purposeFaults('Reads a class.. fast.').includes('holds ".."'));
    assert.ok(purposeFaults('Reads a\nclass.').includes('holds a line break'));
  });

  it('matches a word marker on word boundaries only', () => {
    assert.deepStrictEqual(
      factFaults('Reads the arrows and the entryway.'),
      [],
    );
  });
});

describe('the notes and the tags', () => {
  it('the long-running note says no word of form', () => {
    assert.deepStrictEqual(noteFaults(longRunning.text, 'long'), []);
  });

  it("every tool's batch note says no word of form but `batch`", () => {
    const faults = [...NOT_YET_ASSEMBLED].flatMap((tool) =>
      noteFaults(batchable(tool).text, 'batch').map(
        (fault) => `${tool}: ${fault}`,
      ),
    );
    assert.deepStrictEqual([...new Set(faults)], []);
  });

  it('the shared detail text names the levels and no other word of form', () => {
    assert.deepStrictEqual(
      detailFaults(levelWords(['terse', 'medium', 'full', 'raw'])),
      [],
    );
    assert.ok(detailFaults('"terse" rows as TSV.').length > 0);
  });

  it('a note saying a word of form is refused', () => {
    assert.ok(noteFaults('Returns a JSON array.', 'long').length > 0);
  });

  it('renders each tag as one of the tags', () => {
    for (const tag of ['read-only', 'low-level'] as const) {
      const text = toolDescription({
        tag,
        purpose: purpose('Reads a class.'),
        returns: [],
      });
      assert.ok(
        TAGS.some((each) => text.startsWith(`${each} `)),
        text,
      );
    }
  });
});

describe('the description builder', () => {
  type Item = { readonly name: string; readonly type: string };
  type Reading = {
    readonly objects: readonly Item[];
    readonly gone: readonly string[];
  };
  const schemas: RowSchemas<Reading> = {
    objects: about(
      'for each object',
      rows('objects', {
        columns: [
          { name: 'type', means: 'its type', cell: (o: Item) => o.type },
          { name: 'name', means: 'its name', cell: (o: Item) => o.name },
        ],
        header: 'always',
      }),
    ),
    gone: about(
      'the objects SAP could not load are named',
      marks('gone', 'not loaded', (name: string) => [name]),
    ),
  };

  it('states the purpose first, then the facts from the schemas, then the notes', () => {
    const text = toolDescription({
      purpose: purpose('Reads the objects a package holds.'),
      returns: returnsOf({ shapes: [shapesOf<Reading>(schemas)] }),
      notes: [longRunning],
    });
    assert.ok(text.startsWith('Reads the objects a package holds. '), text);
    assert.ok(
      text.includes(
        'For each object: its type and its name. The objects SAP could not load are named.',
      ),
      text,
    );
    assert.ok(text.endsWith(longRunning.text), text);
  });

  it('writes the tag from its flag alone, before the purpose', () => {
    const text = toolDescription({
      tag: 'read-only',
      purpose: purpose('Reads a class.'),
      returns: [],
    });
    assert.equal(text, '[read-only] Reads a class.');
    assert.equal(
      toolDescription({ purpose: purpose('Reads a class.'), returns: [] }),
      'Reads a class.',
    );
    // A tag written into the purpose is refused there: it comes from the flag.
    assert.ok(purposeFaults('[read-only] Reads a class.').includes('says "["'));
  });

  it('generates facts free of every form marker', () => {
    for (const fact of returnsOf({ shapes: [shapesOf<Reading>(schemas)] })) {
      assert.deepStrictEqual(factFaults(fact.text), [], fact.text);
    }
  });

  it('keeps each part of an assembled description, by its text', () => {
    const parts = {
      purpose: purpose('Reads a class.'),
      returns: [],
      notes: [batchable('GetClass')],
    };
    const text = toolDescription(parts);
    assert.equal(partsOfDescription(text), parts);
    assert.equal(partsOfDescription('Written whole.'), undefined);
  });
});

describe('the batch sentence of an assembled description is its note', () => {
  const parts = {
    tag: 'read-only' as const,
    purpose: purpose('Reads a class.'),
    returns: [],
  };

  it('served where batches are recorded: assembled again with its batchable note', () => {
    const own = { ...parts, purpose: purpose('Reads one batched class.') };
    const served = servedDescription(toolDescription(own), 'GetClass', true);
    // Assembled, not appended: its parts are known by its text — checked
    // before anything else assembles the same text.
    assert.deepStrictEqual(partsOfDescription(served)?.notes, [
      batchable('GetClass'),
    ]);
    assert.equal(
      served,
      toolDescription({ ...own, notes: [batchable('GetClass')] }),
    );
  });

  it('served elsewhere as it was assembled', () => {
    const text = toolDescription(parts);
    assert.equal(servedDescription(text, 'GetClass', false), text);
  });
});

describe('every served tool is assembled, or still listed as not yet', () => {
  let standIn: AdtStandIn;
  const listings: Listing[] = [];
  let savedSystemType: string | undefined;

  before(async () => {
    mock.method(console, 'error', () => {});
    resetProcessLatchForTests();
    savedSystemType = process.env.SAP_SYSTEM_TYPE;
    standIn = await adtStandIn();
    listings.push(...(await listBinaries(['onprem', 'cloud'], standIn)));
  });

  after(async () => {
    await standIn?.close();
    if (savedSystemType === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = savedSystemType;
    resetProcessLatchForTests();
    mock.restoreAll();
  });

  it('serves tools at all, so the check is not vacuous', () => {
    assert.ok(listings.some((listing) => listing.tools.length > 10));
  });

  it("every tool's detail parameter holds the shared text over its levels, and no word of form but the level names", () => {
    const faults: string[] = [];
    for (const listing of listings) {
      for (const tool of listing.tools) {
        const detail = memberOf(
          memberOf(tool.inputSchema, 'properties'),
          'detail',
        );
        if (detail === undefined) continue;
        const levels = memberOf(detail, 'enum');
        const text = memberOf(detail, 'description');
        const offered = Array.isArray(levels)
          ? levels.filter(
              (level): level is keyof typeof LEVEL_SENTENCES =>
                typeof level === 'string' && level in LEVEL_SENTENCES,
            )
          : [];
        // A compact tool states it for the actions that take it:
        // `<actions>: <the shared text>`.
        const shared = levelWords(offered);
        // `<actions>: <shared>`, once or per group of actions: what is
        // left without the shared text is action names alone.
        const left =
          typeof text === 'string' && text.includes(shared)
            ? text.split(shared).join('')
            : undefined;
        const forActions =
          left !== undefined &&
          [...left].every(
            (character) =>
              (character >= 'a' && character <= 'z') ||
              character === '_' ||
              character === ',' ||
              character === ':' ||
              character === ' ',
          );
        if (text !== shared && !forActions) {
          faults.push(`${tool.name}: its detail text is not the shared one`);
        }
        for (const fault of detailFaults(String(text))) {
          faults.push(`${tool.name}: its detail text ${fault}`);
        }
      }
    }
    assert.deepStrictEqual([...new Set(faults)], []);
  });

  it('each served tool is assembled or listed, never both; each assembled one keeps the rules', () => {
    const faults: string[] = [];
    for (const listing of listings) {
      for (const tool of listing.tools) {
        const parts = partsOfDescription(tool.description ?? '');
        const listed = NOT_YET_ASSEMBLED.has(tool.name);
        if (parts === undefined) {
          if (!listed) faults.push(`${tool.name}: written whole, not listed`);
          continue;
        }
        if (listed) faults.push(`${tool.name}: assembled, still listed`);
        // Served exactly as assembled: nothing appended at registration.
        if (toolDescription(parts) !== tool.description) {
          faults.push(`${tool.name}: served text is not its assembled text`);
        }
        for (const fault of purposeFaults(parts.purpose.text)) {
          faults.push(`${tool.name}: its purpose ${fault}`);
        }
        for (const fact of parts.returns) {
          for (const fault of factFaults(fact.text)) {
            faults.push(`${tool.name}: its fact "${fact.text}" ${fault}`);
          }
        }
        for (const note of parts.notes ?? []) {
          const kind = note === longRunning ? 'long' : 'batch';
          for (const fault of noteFaults(note.text, kind)) {
            faults.push(`${tool.name}: its note ${fault}`);
          }
        }
        if (parts.tag !== undefined && !TAGS.includes(`[${parts.tag}]`)) {
          faults.push(`${tool.name}: its tag is none of the tags`);
        }
      }
    }
    assert.deepStrictEqual([...new Set(faults)], []);
  });
});
