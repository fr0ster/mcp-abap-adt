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
  // **No `analyse` is passed, deliberately (fix round 1, task 18 review).**
  // `AdtMessageClassMessage.read` is one of only two read-shaped members in
  // the whole distribution that ship their own default strategy (confirmed
  // against the shipped `AdtMessageClassMessage.js`): when the wire answer
  // carries no failure of its own, the default parses the class document and
  // checks whether `msgno` is actually in it, refusing `OBJECT_NOT_FOUND`
  // when it is not. Passing `{ analyse: analyseException }` — this file's
  // original shape — REPLACED that check rather than composing with it,
  // since the member reads `options?.analyse ?? defaultCheck`.
  // `analyseException` only inspects an `exc` namespace `exception` element, which a
  // missing-msgno answer never carries (ADT answers 200 with the whole class
  // document), so the replaced strategy let a request for a message that
  // does not exist answer `success: true` with the unrelated whole-class
  // document, silently ignoring the `msgno` it echoed. `parseMessageClass`,
  // which the shipped default uses to build that check, is an internal of
  // the messageClass module and not part of this package's public surface
  // (verified against `dist/index.d.ts`), so it cannot be composed with
  // `analyseException` from here — passing nothing and letting the shipped
  // default stand is the available fix.
  return answer(
    { tool: 'ReadMessageClassMessage', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getMessageClassMessage()
        .read({ className, msgno }, undefined),
    (metadata: string) => ({
      success: true,
      message_class_name: className,
      msgno,
      metadata,
    }),
  );
}
