/**
 * Plan step 10.4: a tool's description is assembled — its purpose (the
 * function, the main part), then the facts of what it gives back, then its
 * notes — and every purpose and every fact keeps to the rules of
 * `descriptionRules.ts`. Every tool every binary serves — the full, the
 * read-only and the compact sets, on every transport — is assembled.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import { servedDescription } from '../../../embeddable/BaseMcpServer';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import {
  batchable,
  compactOf,
  longRunning,
  partsOfDescription,
  purpose,
  toolDescription,
  valueFrom,
} from '../../../lib/description';
import { LEVEL_SENTENCES, levelWords } from '../../../lib/strategies/detail';
import { BINARIES } from '../../../lib/toolSet';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import {
  KINDS,
  type Listing,
  listBinaries,
  TRANSPORTS,
} from '../../helpers/servedTools';
import {
  detailFaults,
  FORM_MARKERS,
  noteFaults,
  PURPOSE_LIMIT,
  purposeFaults,
  TAGS,
} from './descriptionRules';

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
    assert.ok(
      purposeFaults('Reads a class.\tWrites it too.').includes(
        'holds more than one sentence',
      ),
    );
  });

  for (const marker of FORM_MARKERS) {
    it(`refuses the marker "${marker}" in a purpose`, () => {
      const text = `Reads the ${marker} of a class.`;
      assert.ok(purposeFaults(text).includes(`says "${marker}"`), text);
    });
  }

  it('refuses ".." and a line break inside the sentence', () => {
    assert.ok(purposeFaults('Reads a class.. fast.').includes('holds ".."'));
    assert.ok(purposeFaults('Reads a\nclass.').includes('holds a line break'));
  });

  it('matches a word marker on word boundaries only', () => {
    assert.deepStrictEqual(
      purposeFaults('Reads the arrows and the entryway.'),
      [],
    );
  });
});

describe('the notes and the tags', () => {
  it('the long-running note says no word of form', () => {
    assert.deepStrictEqual(noteFaults(longRunning.text, 'long'), []);
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
      });
      assert.ok(
        TAGS.some((each) => text.startsWith(`${each} `)),
        text,
      );
    }
  });
});

describe('the description builder', () => {
  it('states the tag, the purpose, then the notes, and nothing else', () => {
    const text = toolDescription({
      tag: 'read-only',
      purpose: purpose('Reads the objects a package holds.'),
      notes: [longRunning],
    });
    assert.equal(
      text,
      `[read-only] Reads the objects a package holds. ${longRunning.text}`,
    );
    assert.equal(
      toolDescription({ purpose: purpose('Reads a class.') }),
      'Reads a class.',
    );
    // A tag written into the purpose is refused there: it comes from the flag.
    assert.ok(purposeFaults('[read-only] Reads a class.').includes('says "["'));
  });

  it("states a compact tool's values, each by its function", () => {
    const listing = toolDescription({
      tag: 'read-only',
      purpose: purpose('Reads the objects a package holds.'),
    });
    const text = toolDescription({
      purpose: purpose('Reads a package or a class.'),
      values: {
        of: 'part',
        each: [
          valueFrom('contents', listing),
          { value: 'source', purpose: purpose('Reads the source of a class.') },
        ],
      },
    });
    assert.equal(
      text,
      'Reads a package or a class. part contents: reads the objects a package holds. part source: reads the source of a class.',
    );
  });

  it("assembles a compact tool from the full tool's parts, a part of its own replacing one", () => {
    const full = toolDescription({
      tag: 'read-only',
      purpose: purpose('Reads one SAP run by its id.'),
      notes: [longRunning],
    });
    assert.equal(compactOf(full), full);
    const own = compactOf(full, { notes: [] });
    assert.deepStrictEqual(partsOfDescription(own)?.notes, []);
    assert.equal(
      partsOfDescription(own)?.purpose,
      partsOfDescription(full)?.purpose,
    );
    assert.throws(() => compactOf('Written whole.'), /not assembled/);
  });

  it("keeps an opening name in capitals when a value's purpose continues the sentence", () => {
    assert.equal(
      toolDescription({
        purpose: purpose('Reads a table.'),
        values: {
          of: 'action',
          each: [
            {
              value: 'data',
              purpose: purpose('SAP gives the data of a table.'),
            },
          ],
        },
      }),
      'Reads a table. action data: SAP gives the data of a table.',
    );
  });

  it('keeps each part of an assembled description, by its text', () => {
    const parts = {
      purpose: purpose('Reads a class.'),
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

describe('every served tool is assembled', () => {
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

  it('reads every binary of the full, read-only and compact sets, each serving tools', () => {
    for (const kind of KINDS) {
      for (const transport of TRANSPORTS) {
        const bin = BINARIES[transport][kind].bin;
        for (const systemType of ['onprem', 'cloud'] as const) {
          const listing = listings.find(
            (each) => each.bin === bin && each.systemType === systemType,
          );
          assert.ok(
            listing !== undefined && listing.tools.length > 0,
            `${bin} on ${systemType}`,
          );
        }
      }
    }
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

  it('each served tool is assembled, and keeps the rules', () => {
    const faults: string[] = [];
    for (const listing of listings) {
      for (const tool of listing.tools) {
        const parts = partsOfDescription(tool.description ?? '');
        if (parts === undefined) {
          faults.push(`${tool.name}: written whole`);
          continue;
        }
        // Served exactly as assembled: nothing appended at registration.
        if (toolDescription(parts) !== tool.description) {
          faults.push(`${tool.name}: served text is not its assembled text`);
        }
        for (const fault of purposeFaults(parts.purpose.text)) {
          faults.push(`${tool.name}: its purpose ${fault}`);
        }
        // A compact tool's values, each by its function: a purpose of the
        // same rules.
        for (const value of parts.values?.each ?? []) {
          for (const fault of purposeFaults(value.purpose.text)) {
            faults.push(`${tool.name}: the purpose of ${value.value} ${fault}`);
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
