import { analyseMessageClassMessage } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read. Subject: a single message inside a Message Class (MSAG). [read-only] Read one message (by number) from an ABAP message class. Answers: "show message 001 of class ZMY_MSGS", "get text of message". There is no per-message resource: this returns the ENTIRE parent class document (XML) under `metadata`, which the caller must search for `msgno` — adt-clients 19 no longer extracts one message from it. `msgno` itself IS validated server-side (a number absent from the class refuses as not-found); it is the text that is not parsed out for you.',
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

export async function handleReadMessageClassMessage(
  context: HandlerContext,
  args: { message_class_name: string; msgno: string },
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

  // Two disagreements with the brief here, both found by the compiler rather
  // than assumed:
  //
  // 1. No `resultsFor(messageDocuments)`. `AdtClient.getMessageClassMessage<R
  //    extends IMessageClassMessageResults>` is bound to
  //    `IMessageClassMessageResults<TRead = string, TWritten = string,
  //    TDeleted = string>` — unlike `IMessageClassResults` (the class's own,
  //    `readonly metadata: IResultStrategy<unknown>`, unconstrained), this
  //    one's defaults fix `read`/`written`/`deleted` to answer literal
  //    `string`. `resultsFor(messageDocuments)` produces
  //    `IResultStrategy<AdtReading<...>>` per slot, which does not satisfy
  //    `IResultStrategy<string>` — TS2345 on the `resultsFor(...)` argument
  //    itself. So this factory is called bare, taking the shipped
  //    `messageDocuments` (`read`/`written`/`deleted`: all `rawDocument`,
  //    i.e. the plain string this member already answers with no injection
  //    at all) — the same way `VersionsCapability` in
  //    `resolveVersionedObject.ts` hardcodes its own source type regardless
  //    of what a factory is given.
  //
  // 2. `.read()`, not `.readMetadata()`. `IMessageClassMessageContract<R>` —
  //    the type the factory actually hands back — composes `IAdtCreatable &
  //    IAdtReadable & IAdtUpdatable` and nothing else (`AdtClient.d.ts`);
  //    `IAdtMetadataReadable` is not among them, even though the concrete
  //    `AdtMessageClassMessage` class implements it (decision 10: the
  //    factory's declared contract is what a caller sees, not what the class
  //    happens to implement). `.readMetadata` does not exist on this
  //    contract — TS2339. `read`'s own doc says it answers "the **class's**
  //    document" — the same one `readMetadata` would have, per
  //    `AdtMessageClassMessage.d.ts`.
  //
  // A message has no resource of its own — `read` fetches the whole PARENT
  // CLASS document, message and all. adt-clients 19 dropped the per-message
  // parse the v18 SDK used to build `message` from (`parseMessageClass` in
  // `@mcp-abap-adt/adt-clients` is an internal of the messageClass module,
  // not part of the package's public surface — verified against
  // `dist/index.d.ts` and its siblings). Rather than invent a parse of a
  // message-class document this repository has never captured (no fixture
  // under `tests/fixtures/adt/` names one), the caller is handed the full
  // document the way `ReadMessageClass` already does, and finds `msgno`
  // inside it themselves.
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
    { tool: 'ReadMessageClassMessage', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getMessageClassMessage()
        .read({ className, msgno }, undefined, {
          analyse: analyseMessageClassMessage(msgno),
        }),
    (metadata: string) => ({
      success: true,
      message_class_name: className,
      msgno,
      metadata,
    }),
  );
}
