import * as z from 'zod';
import { purpose, toolDescription } from '../../../lib/description';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ReadTransportActionLog — what has happened to a transport request.
 *
 * One `log:entry` per lifecycle event: created, object added, object deleted,
 * owner changed. Read-only, and the reason it is here rather than a
 * convenience: a `removeobject` answers by repeating the object it was asked
 * about, for an entry that existed and for one that never did, so its own
 * answer settles nothing. This log, or a re-read through
 * `ReadTransportObjects`, is what says a removal landed.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  about,
  headShape,
  listAnswerAt,
  omitting,
  type RowSchemas,
  rows,
  values,
  writeJson,
  writeListing,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { child, childAt, isList, type XmlRead } from '../../../lib/xml/tree';

type ReadTransportActionLogArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The text of one `log:entry`, as `structured` parses it.
 *
 * **On premise the text is element content, not an attribute.** Measured on
 * 2026-09-25: every entry arrives as
 * `<log:message><log:messageText key="TK(188)">…</log:messageText></log:message>`,
 * which `structured` parses to `log:message → log:messageText → #text`.
 * Reading only `log:text` answered `count: 0` for a log that held six
 * entries. The `log:text` spellings stay for the shape this was first
 * written against.
 */
const textOf = (entry: XmlRead): string => {
  const message = childAt(entry, 'log:message', 'log:messageText');
  const text =
    (typeof message === 'object' ? child(message, '#text') : message) ??
    childAt(entry, '@', 'log:text') ??
    child(entry, 'log:text') ??
    '';
  return String(text);
};

/** One line of the log. */
interface LogEntry {
  readonly text: string;
}

const entriesOf = (value: XmlRead): LogEntry[] => {
  const log = child(value, 'log:log') ?? value;
  const raw = child(log, 'log:entry');
  const list = isList(raw) ? raw : raw ? [raw] : [];
  return list.map((entry) => ({ text: textOf(entry) }));
};

/**
 * The kinds of line the answers leave out by definition: one with no text
 * (nothing to read, at every level) and, at terse, a separator.
 */
const kindOfEntry = (entry: LogEntry) =>
  entry.text === '' ? 'empty' : isSeparator(entry.text) ? 'separator' : 'entry';
const TERSE_OMITS = omitting(kindOfEntry, {
  empty: 'a line without text: nothing to read',
  separator: 'a separator line: no entry',
});

/** The lists the action log listing writes: what its description states. */
export const ACTION_LOG_LISTS: RowSchemas<{ entries: LogEntry[] }> = {
  entries: about(
    'for each event, such as created, object added, object deleted or owner changed',
    rows('entries', {
      columns: [
        {
          name: 'entry',
          means: 'its text',
          cell: (entry: LogEntry) => entry.text,
        },
      ],
      header: 'always',
      omit: TERSE_OMITS,
    }),
  ),
};

/** The heads the action log listing opens with. */
export const ACTION_LOG_HEADS = [
  headShape('transport', 'transport number'),
  headShape('count', 'number of events'),
];

export const TOOL_DEFINITION = {
  name: 'ReadTransportActionLog',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the action log of a transport or task: every event of its life, its objects added and taken out among them.',
    ),
  }),
  inputSchema: z.object({
    transport_number: z
      .string()
      .describe(
        'Transport REQUEST or TASK number. A request answers its own lifecycle events; a task answers the events of the objects on it.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

const MEDIUM_OMITS = omitting(kindOfEntry, {
  empty: 'a line without text: nothing to read',
});

/** A line of the log made of `=` or `-` alone: a separator, nothing to read. */
function isSeparator(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  for (const character of trimmed) {
    if (character !== '=' && character !== '-') return false;
  }
  return true;
}

export async function handleReadTransportActionLog(
  context: HandlerContext,
  args: ReadTransportActionLogArgs,
) {
  const { connection, logger } = context;

  if (!args?.transport_number) {
    return return_error(new Error('transport_number is required'));
  }

  const detail = detailOf(args);

  // Every line but an empty one, its text, by the JSON writer.
  const mediumLog = (value: XmlRead) => {
    const entries = entriesOf(value);
    return writeJson(
      {
        success: true,
        transport_number: args.transport_number,
        count: entries.filter((entry) => !MEDIUM_OMITS.omits(entry)).length,
      },
      { entries },
      {
        entries: values('entries', (entry: LogEntry) => entry.text, {
          omit: MEDIUM_OMITS,
        }),
      },
    );
  };

  // What the log answers at each level, selected before the call
  // (`src/lib/detail`): terse its lines as text, one entry per line, the
  // separator lines (only `=` or `-`) left out — they carry nothing; medium
  // the former terse JSON; full the parse; raw the document.
  const shown = listAnswerAt<
    AdtReading<XmlRead>,
    string | XmlRead | ReturnType<typeof mediumLog>['answer']
  >(
    {
      // Every entry, written by the listing writer: a separator line (only
      // `=` or `-`) is no entry — an omit kind of the approved shape — and
      // is not counted.
      terse: (reading: AdtReading<XmlRead>) => {
        const entries = entriesOf(reading.value);
        return writeListing({
          heads: [
            { head: 'transport', value: args.transport_number },
            {
              head: 'count',
              value: String(
                entries.filter((entry) => !TERSE_OMITS.omits(entry)).length,
              ),
            },
          ],
          reading: { entries },
          lists: ACTION_LOG_LISTS,
        });
      },
      medium: (reading) => mediumLog(reading.value),
      full: (reading) => reading.value ?? reading.raw,
      raw: (reading) => reading.raw,
    },
    levelOf(args),
  );

  return answer(
    { tool: 'ReadTransportActionLog', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .readActionLog(args.transport_number, { analyse: analyseException }),
    shown,
  );
}
