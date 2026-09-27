import { analyseMessageClassMessage } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve a single message (by number) from an ABAP message class (MSAG/T100). There is no per-message resource: ADT answers the ENTIRE parent class document (XML) under the `message` field, which the caller must search for `msgno` — adt-clients 19 no longer extracts one message from it. `msgno` itself IS validated server-side (a number absent from the class refuses as not-found); it is the text that is not parsed out for you.',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Parent message class name (e.g., ZMY_MSGS).',
      },
      msgno: {
        type: 'string',
        description: 'Message number (e.g., "001").',
      },
    },
    required: ['message_class_name', 'msgno'],
  },
} as const;

interface GetMessageClassMessageArgs {
  message_class_name: string;
  msgno: string;
}

export async function handleGetMessageClassMessage(
  context: HandlerContext,
  args: GetMessageClassMessageArgs,
) {
  const { connection, logger } = context;
  const { message_class_name, msgno } = args;
  if (!message_class_name) {
    return return_error(new Error('message_class_name is required'));
  }
  if (!msgno) {
    return return_error(new Error('msgno is required'));
  }

  const className = message_class_name.toUpperCase();

  // No `resultsFor(messageDocuments)` and `.read()`, not `.readMetadata()`
  // — same two disagreements with a naive port that `ReadMessageClassMessage`
  // found and documents in full: `IMessageClassMessageResults` fixes
  // `read`/`written`/`deleted` to literal `string`, so `resultsFor(...)`
  // does not type-check against it, and `.readMetadata` is not on this
  // contract at all. A message has no resource of its own — `read` fetches
  // the whole PARENT CLASS document — and adt-clients 19 dropped the
  // per-message parse the v18 SDK built `message` from, same as
  // `ReadMessageClassMessage` found. The caller gets the full document,
  // as that sibling tool already does, under this tool's own field name.
  //
  // **The msgno check is passed in now, and by name.** `AdtMessageClassMessage.read`
  // used to be one of two read-shaped members in the distribution shipping a
  // default strategy of its own: when the wire answer carried no failure, it
  // parsed the class document and refused `OBJECT_NOT_FOUND` if `msgno` was not
  // in it. adt-clients 23 interprets nothing — every member is `options?.analyse`
  // with no `?? default` behind it — so that check now arrives from here as
  // `analyseMessageClassMessage(msgno)`, the same reading, moved into
  // `@mcp-abap-adt/adt-strategies`. It is built for the number asked about, which
  // is why it is called and not merely referenced.
  //
  // `analyseException` would not do: it only inspects an `exc:exception` element,
  // which a missing-msgno answer never carries — ADT answers 200 with the whole
  // class document — so a request for a message that does not exist would come
  // back `success: true` carrying that unrelated document, silently ignoring the
  // `msgno` it echoed.
  return answer(
    { tool: 'GetMessageClassMessage', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getMessageClassMessage()
        .read({ className, msgno }, undefined, {
          analyse: analyseMessageClassMessage(msgno),
        }),
    (document: string) => ({
      success: true,
      message_class_name: className,
      msgno,
      message: document,
    }),
  );
}
