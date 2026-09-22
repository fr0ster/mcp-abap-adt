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
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, type Terse } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadTransportActionLog',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read the action log of a transport request: one entry per lifecycle event — created, object added, object deleted, owner changed. This is what confirms a RemoveTransportObject landed, since that call answers by echoing what it was asked.',
  inputSchema: {
    type: 'object',
    properties: {
      transport_number: {
        type: 'string',
        description:
          'Transport REQUEST or TASK number, e.g. E19K905942. A request answers its own lifecycle events; a task answers the events of the objects on it.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['transport_number'],
  },
} as const;

interface ReadTransportActionLogArgs {
  transport_number: string;
  detail?: 'terse' | 'full' | 'raw';
}

/** One `log:entry`, as `structured` parses it. */
const entriesOf = (value: unknown): { text: string }[] => {
  const log = (value as Record<string, any>)?.['log:log'] ?? value;
  const raw = (log as Record<string, any>)?.['log:entry'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((entry: any) => ({
      text: String(entry?.['@']?.['log:text'] ?? entry?.['log:text'] ?? ''),
    }))
    .filter((entry: { text: string }) => entry.text !== '');
};

export async function handleReadTransportActionLog(
  context: HandlerContext,
  args: ReadTransportActionLogArgs,
) {
  const { connection, logger } = context;

  if (!args?.transport_number) {
    return return_error(new Error('transport_number is required'));
  }

  const detail = detailOf(args);

  const terseLog: Terse<unknown> = (value) => {
    const entries = entriesOf(value);
    return {
      success: true,
      transport_number: args.transport_number,
      count: entries.length,
      entries: entries.map((entry) => entry.text),
    };
  };

  return answer(
    { tool: 'ReadTransportActionLog', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .readActionLog(args.transport_number, { analyse: analyseException }),
    project(detail, terseLog),
  );
}
