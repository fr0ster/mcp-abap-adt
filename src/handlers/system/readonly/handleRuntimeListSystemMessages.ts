import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  feedSystemMessages,
  type ISystemMessageEntry,
} from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import {
  answered,
  type DetailTable,
  formatted,
  type ListDetailTable,
  rawLevel,
  readingAt,
  rows,
  whole,
  writeListing,
  written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { ourFeeds } from '../../../lib/strategies/resultSets';

export const TOOL_DEFINITION = {
  name: 'RuntimeListSystemMessages',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [runtime] List SM02 system messages. By default (detail terse) TSV under a # count line: id, createdOn, author, title per message; with detail medium or full each message as SAP writes it: id, messageId, title, text, createdOn, updated, createdBy and author; raw the feed as ADT sent it.',
  inputSchema: z.object({
    user: z.string().optional().describe('Filter by author username.'),
    max_results: z
      .number()
      .optional()
      .describe('Maximum number of messages to return.'),
    from: z
      .string()
      .optional()
      .describe('Start of time range in YYYYMMDDHHMMSS format.'),
    to: z
      .string()
      .optional()
      .describe('End of time range in YYYYMMDDHHMMSS format.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type RuntimeListSystemMessagesArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleRuntimeListSystemMessages(
  context: HandlerContext,
  args: RuntimeListSystemMessagesArgs,
) {
  const { connection, logger } = context;
  // The level's reading, selected before the call and passed to it.
  const feeds = new AdtRuntimeClient(connection, logger).getFeeds({
    ...ourFeeds,
    systemMessages: readingAt(SYSTEM_MESSAGE_READINGS, levelOf(args)),
  });

  return answer(
    { tool: 'RuntimeListSystemMessages', detail: detailOf(args) },
    () =>
      feeds.systemMessages({
        analyse: analyseException,
        user: args?.user,
        maxResults: args?.max_results,
        from: args?.from,
        to: args?.to,
      }),
    answered,
  );
}

/**
 * What the messages answer at each `detail` (`src/lib/detail`): terse a TSV
 * row per message — id, createdOn, author, title —; medium and full every
 * field adt-strategies read (`feedSystemMessages`); raw the feed as ADT sent
 * it.
 */
const SYSTEM_MESSAGE_READINGS: ListDetailTable<string | object> = (() => {
  const every = formatted(
    feedSystemMessages,
    (messages: ISystemMessageEntry[]) => ({
      success: true,
      count: messages.length,
      messages,
    }),
  );
  return {
    // Every message the feed held, written by the listing writer.
    terse: written(feedSystemMessages, (messages: ISystemMessageEntry[]) =>
      writeListing({
        heads: [{ head: 'count', value: String(messages.length) }],
        reading: { messages },
        lists: {
          messages: rows('messages', {
            columns: [
              {
                name: 'id',
                cell: (m: ISystemMessageEntry) => m.id ?? m.messageId ?? '',
              },
              {
                name: 'createdOn',
                cell: (m: ISystemMessageEntry) => m.createdOn ?? '',
              },
              {
                name: 'author',
                cell: (m: ISystemMessageEntry) => m.author ?? m.createdBy ?? '',
              },
              {
                name: 'title',
                cell: (m: ISystemMessageEntry) => m.title ?? '',
              },
            ],
            header: 'always',
          }),
        },
      }),
    ),
    // The feed's messages whole, as read.
    medium: whole(every),
    full: every,
    raw: rawLevel,
  };
})();
