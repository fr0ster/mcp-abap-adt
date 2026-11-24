import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  feedSystemMessages,
  type ISystemMessageEntry,
} from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
import {
  about,
  answered,
  type DetailTable,
  formatted,
  headShape,
  type ListDetailTable,
  type RowSchemas,
  rawLevel,
  readingAt,
  rows,
  shapesOf,
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

/** The lists the listing writes: what the description states. */
export const SYSTEM_MESSAGES_LISTS: RowSchemas<{
  messages: ISystemMessageEntry[];
}> = {
  messages: about(
    'for each system message',
    rows('messages', {
      columns: [
        {
          name: 'id',
          means: 'its ID',
          cell: (m: ISystemMessageEntry) => m.id ?? m.messageId ?? '',
        },
        {
          name: 'createdOn',
          means: 'when it was created',
          cell: (m: ISystemMessageEntry) => m.createdOn ?? '',
        },
        {
          name: 'author',
          means: 'its author',
          cell: (m: ISystemMessageEntry) => m.author ?? m.createdBy ?? '',
        },
        {
          name: 'title',
          means: 'its title',
          cell: (m: ISystemMessageEntry) => m.title ?? '',
        },
      ],
      header: 'always',
    }),
  ),
};

/** The heads the listing opens with. */
export const SYSTEM_MESSAGES_HEADS = [headShape('count', 'how many there are')];

export const TOOL_DEFINITION = {
  name: 'RuntimeListSystemMessages',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Lists the system messages of the SAP system, the ones SM02 shows, optionally by one author.',
    ),
    returns: returnsOf({
      heads: SYSTEM_MESSAGES_HEADS,
      shapes: [shapesOf(SYSTEM_MESSAGES_LISTS)],
    }),
    inline: true,
  }),
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
        lists: SYSTEM_MESSAGES_LISTS,
      }),
    ),
    // The feed's messages whole, as read.
    medium: whole(every),
    full: every,
    raw: rawLevel,
  };
})();
