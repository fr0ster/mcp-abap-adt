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
  completeAnswer,
  type DetailTable,
  formatted,
  identityOf,
  rawLevel,
  readingAt,
  Written,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { ourFeeds } from '../../../lib/strategies/resultSets';

/** A message's identity: its id, and when it was created. */
const messageIdentity = (m: ISystemMessageEntry) =>
  identityOf([m.id ?? m.messageId ?? '', m.createdOn ?? '', m.title ?? '']);

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
const SYSTEM_MESSAGE_READINGS: DetailTable<string | object> = (() => {
  const every = formatted(
    feedSystemMessages,
    (messages: ISystemMessageEntry[]) => ({
      success: true,
      count: messages.length,
      messages,
    }),
  );
  return {
    // Every message the feed held, or nothing (`completeAnswer`).
    terse: formatted(
      feedSystemMessages,
      completeAnswer(
        'RuntimeListSystemMessages',
        (messages: ISystemMessageEntry[]) => messages.map(messageIdentity),
        (messages: ISystemMessageEntry[]) =>
          Written.text(
            [
              { head: 'count', value: String(messages.length) },
              { header: ['id', 'createdOn', 'author', 'title'] },
              ...messages.map((m) => ({
                row: [
                  m.id ?? m.messageId ?? '',
                  m.createdOn ?? '',
                  m.author ?? m.createdBy ?? '',
                  m.title ?? '',
                ],
              })),
            ],
            [0, 1, 3],
          ),
      ),
    ),
    medium: every,
    full: every,
    raw: rawLevel,
  };
})();
