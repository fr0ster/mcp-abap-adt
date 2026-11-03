import { AdtRuntimeClient } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourFeeds } from '../../../lib/strategies/resultSets';

export const TOOL_DEFINITION = {
  name: 'RuntimeListSystemMessages',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] [runtime] List SM02 system messages. Returns structured entries with id, title, text, severity, validity period, and author.',
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
  }),
} as const;

interface RuntimeListSystemMessagesArgs {
  user?: string;
  max_results?: number;
  from?: string;
  to?: string;
}

export async function handleRuntimeListSystemMessages(
  context: HandlerContext,
  args: RuntimeListSystemMessagesArgs,
) {
  const { connection, logger } = context;
  const feeds = new AdtRuntimeClient(connection, logger).getFeeds(ourFeeds);

  // `systemMessages()` answers `IAdtResponse<ISystemMessageEntry[]>` as of
  // adt-clients 19, not a bare array — the same parsed entries as before,
  // reached through `.getResult().value` now instead of directly.
  return answer(
    { tool: 'RuntimeListSystemMessages', detail: 'terse' },
    () =>
      feeds.systemMessages({
        analyse: analyseException,
        user: args?.user,
        maxResults: args?.max_results,
        from: args?.from,
        to: args?.to,
      }),
    (messages) => ({
      success: true,
      count: messages.length,
      messages,
    }),
  );
}
