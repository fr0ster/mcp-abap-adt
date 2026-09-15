/**
 * Unit tests: Message Class (MSAG) CRUD tools.
 *  - the message-class handlers dispatch to client.getMessageClass()
 *    with the right config (name uppercased, package, transport, master lang);
 *  - the message handlers dispatch to client.getMessageClassMessage()
 *    with { className, msgno, msgtext, ... };
 *  - read handlers surface the parsed messageClass / message.
 * SAP-free via a mocked AdtClient.
 */

const mockMc = {
  create: jest.fn(),
  read: jest.fn(),
  readMetadata: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockMsg = {
  create: jest.fn(),
  read: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getMessageClass: () => mockMc,
    getMessageClassMessage: () => mockMsg,
  }),
}));

import { handleCreateMessageClass } from '../../handlers/message_class/high/handleCreateMessageClass';
import { handleCreateMessageClassMessage } from '../../handlers/message_class/high/handleCreateMessageClassMessage';
import { handleDeleteMessageClass } from '../../handlers/message_class/high/handleDeleteMessageClass';
import { handleGetMessageClass } from '../../handlers/message_class/high/handleGetMessageClass';
import { handleUpdateMessageClassMessage } from '../../handlers/message_class/high/handleUpdateMessageClassMessage';
import { handleReadMessageClass } from '../../handlers/message_class/readonly/handleReadMessageClass';
import { handleReadMessageClassMessage } from '../../handlers/message_class/readonly/handleReadMessageClassMessage';
import { okResponse, reading } from '../helpers/fakeClient';

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  return JSON.parse(text);
}

describe('Message Class (MSAG) CRUD tools', () => {
  beforeEach(() => {
    for (const m of [mockMc, mockMsg]) {
      for (const fn of Object.values(m)) (fn as jest.Mock).mockReset();
    }
  });

  // adt-clients 19: a message class has no source resource of its own, so
  // `read` is gone and `readMetadata` answers the whole document verbatim
  // (see `handleReadMessageClass.ts`) — there is no longer a parsed
  // `messageClass.messages[]` to assert against, only the raw document.
  it('ReadMessageClass answers the class document via readMetadata', async () => {
    const metadata =
      '<msag:messageClass adtcore:name="ZMY_MSGS">...</msag:messageClass>';
    mockMc.readMetadata.mockResolvedValue(okResponse(reading(metadata)));

    const result = await handleReadMessageClass(ctx, {
      message_class_name: 'zmy_msgs',
    });

    expect(result.isError).toBe(false);
    expect(mockMc.readMetadata).toHaveBeenCalledWith(
      { name: 'ZMY_MSGS' },
      expect.objectContaining({ analyse: expect.any(Function) }),
    );
    expect(payload(result).metadata).toBe(metadata);
  });

  // GetMessageClass calls readMetadata, not read (task 18: `.read()` does
  // not exist on `IMessageClassContract` in v19 — see
  // `handleGetMessageClass.ts`'s own comment). A `readMetadata` answering
  // `undefined` is not a shape `answer()`'s adapter can destructure, so it
  // surfaces as a local `client_threw`/`adapter_threw` failure rather than
  // a structured "not found" — still `isError: true`, for a different
  // reason than this test's name once assumed.
  it('GetMessageClass surfaces an error when readMetadata returns undefined', async () => {
    mockMc.readMetadata.mockResolvedValue(undefined);
    const result = await handleGetMessageClass(ctx, {
      message_class_name: 'ZNOPE',
    });
    expect(result.isError).toBe(true);
  });

  it('CreateMessageClass dispatches create() with camelCase config', async () => {
    mockMc.create.mockResolvedValue({ createResult: { status: 201 } });

    const result = await handleCreateMessageClass(ctx, {
      message_class_name: 'zmy_msgs',
      description: 'My messages',
      package_name: '$TMP',
      master_language: 'EN',
    });

    expect(result.isError).toBe(false);
    expect(mockMc.create).toHaveBeenCalledWith({
      name: 'ZMY_MSGS',
      description: 'My messages',
      packageName: '$TMP',
      transportRequest: undefined,
      masterLanguage: 'EN',
    });
  });

  it('DeleteMessageClass dispatches delete() with name + transport', async () => {
    mockMc.delete.mockResolvedValue({ deleteResult: { status: 200 } });

    const result = await handleDeleteMessageClass(ctx, {
      message_class_name: 'ZMY_MSGS',
      transport_request: 'E19K900001',
    });

    expect(result.isError).toBe(false);
    expect(mockMc.delete).toHaveBeenCalledWith({
      name: 'ZMY_MSGS',
      transportRequest: 'E19K900001',
    });
  });

  it('CreateMessageClassMessage dispatches to getMessageClassMessage().create', async () => {
    mockMsg.create.mockResolvedValue({ createResult: { status: 200 } });

    const result = await handleCreateMessageClassMessage(ctx, {
      message_class_name: 'zmy_msgs',
      msgno: '001',
      msgtext: 'Hello &1',
      self_explanatory: true,
      transport_request: 'E19K900001',
    });

    expect(result.isError).toBe(false);
    expect(mockMsg.create).toHaveBeenCalledWith({
      className: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Hello &1',
      selfExplanatory: true,
      description: undefined,
      transportRequest: 'E19K900001',
    });
  });

  it('UpdateMessageClassMessage dispatches update() with the new text', async () => {
    mockMsg.update.mockResolvedValue({ updateResult: { status: 200 } });

    const result = await handleUpdateMessageClassMessage(ctx, {
      message_class_name: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Updated &1',
    });

    expect(result.isError).toBe(false);
    expect(mockMsg.update).toHaveBeenCalledWith({
      className: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Updated &1',
      selfExplanatory: undefined,
      description: undefined,
      transportRequest: undefined,
    });
  });

  // adt-clients 19: `AdtMessageClassMessage`'s factory contract only composes
  // `IAdtCreatable & IAdtReadable & IAdtUpdatable` — no `IAdtMetadataReadable`
  // — and `read`/`written`/`deleted` are fixed to answer plain `string` (see
  // `handleReadMessageClassMessage.ts`'s own comment), so this now calls
  // `read()` and answers the parent class document verbatim rather than a
  // parsed single message.
  //
  // Fix round 1 (task 18 review): no `analyse` is passed here, deliberately.
  // `AdtMessageClassMessage.read` is one of only two read-shaped members in
  // the whole distribution that ship their own default strategy — it checks
  // whether `msgno` is actually in the parsed class document and refuses
  // `OBJECT_NOT_FOUND` when it is not. Passing `{ analyse: analyseException }`
  // (this test's own original shape) REPLACED that check rather than
  // composing with it, since the member reads `options?.analyse ??
  // defaultCheck` — see `handleReadMessageClassMessage.ts`'s own comment for
  // the full finding.
  it('ReadMessageClassMessage answers the parent class document via read', async () => {
    const classDocument =
      '<msag:messageClass><mc:messages><mc:message mc:msgno="001">Hello &amp;1</mc:message></mc:messages></msag:messageClass>';
    mockMsg.read.mockResolvedValue(okResponse(classDocument));

    const result = await handleReadMessageClassMessage(ctx, {
      message_class_name: 'ZMY_MSGS',
      msgno: '001',
    });

    expect(result.isError).toBe(false);
    expect(mockMsg.read).toHaveBeenCalledWith(
      { className: 'ZMY_MSGS', msgno: '001' },
      undefined,
    );
    expect(payload(result).metadata).toBe(classDocument);
  });
});
