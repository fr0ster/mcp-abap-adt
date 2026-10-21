import { analyseMessageClassMessage } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { classMessageOf } from '../../../lib/strategies/messageClassMessage';
import type { AnswerDetail } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the message numbered msgno of the ABAP message class (MSAG/T100) named by message_class_name in one request. Answers the one message under `message`: its number (msgno), text (msgtext), self-explanatory flag (selfexplainatory), long-text flag (documented), last changer (lastchangedby), change time (lastmodified), and every other field the system gives the message. A number absent from the class is refused as missing.',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Parent message class name.',
      },
      msgno: {
        type: 'string',
        description: 'Message number (e.g., "001").',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['message_class_name', 'msgno'],
  },
} as const;

interface GetMessageClassMessageArgs {
  message_class_name: string;
  msgno: string;
  detail?: AnswerDetail;
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

  const detail = detailOf(args);

  // No `resultsFor(messageDocuments)` and `.read()`, not `.readMetadata()`:
  // `IMessageClassMessageResults` fixes `read`/`written`/`deleted` to literal
  // `string`, so a reading of ours cannot be injected there, and
  // `.readMetadata` is not on this contract at all. A message has no resource
  // of its own — `read` fetches the whole PARENT CLASS document, as SAP sent
  // it — so the one message is picked from that document here
  // (`classMessageOf`), and `detail: 'raw'` answers the document itself.
  //
  // **`analyseMessageClassMessage(msgno)` is passed.** ADT answers a
  // message read with the whole class document, 200, whether or not `msgno`
  // is in it. adt-clients 22 checked that inside the member; 23 applies no
  // verdict of its own, and the check is this strategy from adt-strategies
  // (MIGRATION-23 §3) — without it a message that does not exist answers
  // `success: true` with the unrelated class document.
  return answer(
    { tool: 'GetMessageClassMessage', detail },
    () =>
      createAdtClient(connection, logger)
        .getMessageClassMessage()
        .read({ className, msgno }, undefined, {
          analyse: analyseMessageClassMessage(msgno),
        }),
    (document: string) => {
      if (detail === 'raw') return document;
      const message = classMessageOf(document, msgno);
      // The refusal above reads the same document with the same comparison,
      // so a class without the message never reaches this; a document it
      // passed that still holds no such element is a defect of the reading.
      if (message === undefined) {
        throw new Error(
          `Message ${msgno} was not found in the class document of ${className}`,
        );
      }
      const answered = {
        success: true,
        message_class_name: className,
        msgno,
        message: message.fields,
      };
      // `full` adds the element as parsed — attributes verbatim, its links
      // included — so nothing of the one message is dropped.
      return detail === 'full'
        ? { ...answered, element: message.element }
        : answered;
    },
  );
}
