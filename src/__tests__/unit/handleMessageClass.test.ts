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
  checkDeletion: jest.fn(),
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
import { handleGetMessageClassMessage } from '../../handlers/message_class/high/handleGetMessageClassMessage';
import { handleUpdateMessageClassMessage } from '../../handlers/message_class/high/handleUpdateMessageClassMessage';
import { parseStructure } from '../../lib/strategies/reading';
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
  // (see `handleGetMessageClass.ts`) — there is no longer a parsed
  // `messageClass.messages[]` to assert against, only the raw document.
  it('GetMessageClass answers the class document via readMetadata', async () => {
    const metadata =
      '<msag:messageClass adtcore:name="ZMY_MSGS">...</msag:messageClass>';
    mockMc.readMetadata.mockResolvedValue(okResponse(reading(metadata)));

    const result = await handleGetMessageClass(ctx, {
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

  // Task 20: `create()` is one request now (adt-clients 18's fat workflow —
  // validate/create/check — is gone), answered through `answer()`/
  // `IAdtResponse`, not the old `{ createResult }` state bag.
  it('CreateMessageClass dispatches create() with camelCase config', async () => {
    mockMc.create.mockResolvedValue(okResponse(reading(undefined, '', 201)));

    const result = await handleCreateMessageClass(ctx, {
      message_class_name: 'zmy_msgs',
      description: 'My messages',
      package_name: '$TMP',
      master_language: 'EN',
    });

    expect(result.isError).toBe(false);
    expect(mockMc.create).toHaveBeenCalledWith(
      {
        name: 'ZMY_MSGS',
        description: 'My messages',
        packageName: '$TMP',
        transportRequest: undefined,
        masterLanguage: 'EN',
      },
      expect.objectContaining({ analyse: expect.any(Function) }),
    );
  });

  // Task 21: the deletion service, not the old `{ deleteResult }` state bag —
  // `delete()` is dispatched through `answer()`/`IAdtResponse`, with
  // `analyseDeletion` reading the deletion document (`del:deletionResult`) for
  // a refusal masked as a 200, and `terseDeletion` projecting `deleted`/
  // `object` out of it.
  it('DeleteMessageClass dispatches delete() with name + transport', async () => {
    const deletionDoc =
      '<del:deletionResult xmlns:del="http://www.sap.com/adt/deletion" ' +
      'xmlns:adtcore="http://www.sap.com/adt/core">' +
      '<del:object del:isDeleted="true" adtcore:name="ZMY_MSGS"/>' +
      '</del:deletionResult>';
    const checkDoc =
      '<del:checkResponse xmlns:del="http://www.sap.com/adt/deletion" ' +
      'xmlns:adtcore="http://www.sap.com/adt/core">' +
      '<del:object del:isDeletable="true" adtcore:name="ZMY_MSGS"/>' +
      '</del:checkResponse>';
    mockMc.checkDeletion.mockResolvedValue(
      okResponse(reading(parseStructure(checkDoc), checkDoc, 200)),
    );
    mockMc.delete.mockResolvedValue(
      okResponse(reading(parseStructure(deletionDoc), deletionDoc, 200)),
    );

    const result = await handleDeleteMessageClass(ctx, {
      message_class_name: 'ZMY_MSGS',
      transport_request: 'SIDK900001',
    });

    expect(result.isError).toBe(false);
    expect(mockMc.checkDeletion).toHaveBeenCalledWith(
      { name: 'ZMY_MSGS', transportRequest: 'SIDK900001' },
      expect.objectContaining({ analyse: expect.any(Function) }),
    );
    expect(mockMc.delete).toHaveBeenCalledWith(
      { name: 'ZMY_MSGS', transportRequest: 'SIDK900001' },
      expect.objectContaining({ analyse: expect.any(Function) }),
    );
    expect(payload(result)).toMatchObject({
      deleted: true,
      object: 'ZMY_MSGS',
    });
  });

  // Task 20: dispatched through `answer()`/`IAdtResponse`, not the old
  // `{ createResult }` state bag; `getMessageClassMessage()` is called with
  // no results argument (`IMessageClassMessageResults`'s generic bound fixes
  // its slots to literal `string`, so `resultsFor(...)` does not type-check
  // against it — see `CreateMessageClassMessage.ts`'s own comment) and the
  // write carries `{ analyse }` as a second argument.
  it('CreateMessageClassMessage dispatches to getMessageClassMessage().create', async () => {
    mockMsg.create.mockResolvedValue(okResponse(reading(undefined, '', 200)));

    const result = await handleCreateMessageClassMessage(ctx, {
      message_class_name: 'zmy_msgs',
      msgno: '001',
      msgtext: 'Hello &1',
      self_explanatory: true,
      transport_request: 'SIDK900001',
    });

    expect(result.isError).toBe(false);
    expect(mockMsg.create).toHaveBeenCalledWith(
      {
        className: 'ZMY_MSGS',
        msgno: '001',
        msgtext: 'Hello &1',
        selfExplanatory: true,
        description: undefined,
        transportRequest: 'SIDK900001',
      },
      expect.objectContaining({ analyse: expect.any(Function) }),
    );
  });

  // Task 20: `AdtMessageClassMessage` is not `IAdtLockable` — its write locks
  // and unlocks itself internally — so there is no `lock_handle` parameter
  // here at all, and `options` carries only `analyse`.
  it('UpdateMessageClassMessage dispatches update() with the new text', async () => {
    mockMsg.update.mockResolvedValue(okResponse(reading(undefined, '', 200)));

    const result = await handleUpdateMessageClassMessage(ctx, {
      message_class_name: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Updated &1',
    });

    expect(result.isError).toBe(false);
    expect(mockMsg.update).toHaveBeenCalledWith(
      {
        className: 'ZMY_MSGS',
        msgno: '001',
        msgtext: 'Updated &1',
        selfExplanatory: undefined,
        description: undefined,
        transportRequest: undefined,
      },
      expect.objectContaining({ analyse: expect.any(Function) }),
    );
  });

  // A message has no resource of its own: `read` answers the PARENT CLASS
  // document, every message in it, each an `mc:messages` element with its
  // fields as attributes (the shape measured on premise, BASIS 816,
  // 2026-10-21; values here are placeholders). The tool answers the one
  // message asked for, and the document only at `detail: 'raw'`.
  const classDocument =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<mc:messageClass adtcore:name="ZMY_MSGS" adtcore:type="MSAG/N" xmlns:mc="http://www.sap.com/adt/MessageClass" xmlns:adtcore="http://www.sap.com/adt/core">' +
    '<mc:messages mc:msgno="000" mc:msgtext="First &amp;1" mc:selfexplainatory="false" mc:documented="false" mc:lastchangedby="SAPUSER01" mc:lastmodified="2020-01-01T00:00:00Z" adtcore:name="ZMY_MSGS000">' +
    '<atom:link href="messages/000" rel="self" xmlns:atom="http://www.w3.org/2005/Atom"/></mc:messages>' +
    '<mc:messages mc:msgno="001" mc:msgtext="Hello &amp;1" mc:selfexplainatory="true" mc:documented="true" mc:lastchangedby="SAPUSER01" mc:lastmodified="2021-02-03T04:05:06Z" adtcore:name="ZMY_MSGS001">' +
    '<atom:link href="messages/001" rel="self" xmlns:atom="http://www.w3.org/2005/Atom"/>' +
    '<atom:link href="messages/001/longtext" rel="longtext" xmlns:atom="http://www.w3.org/2005/Atom"/></mc:messages>' +
    '<mc:messages mc:msgno="002" mc:msgtext="Third" mc:selfexplainatory="false" mc:documented="false" mc:lastchangedby="SAPUSER01" mc:lastmodified="2022-01-01T00:00:00Z" adtcore:name="ZMY_MSGS002"/>' +
    '</mc:messageClass>';

  const readMessage = async (detail?: string) => {
    mockMsg.read.mockResolvedValue(okResponse(classDocument));
    return handleGetMessageClassMessage(ctx, {
      message_class_name: 'zmy_msgs',
      msgno: '001',
      ...(detail !== undefined ? { detail } : {}),
    } as any);
  };

  it('GetMessageClassMessage answers the one message, read from the class document', async () => {
    const result = await readMessage();

    expect(result.isError).toBe(false);
    expect(mockMsg.read).toHaveBeenCalledWith(
      { className: 'ZMY_MSGS', msgno: '001' },
      undefined,
      expect.objectContaining({ analyse: expect.any(Function) }),
    );
    expect(payload(result)).toEqual({
      success: true,
      message_class_name: 'ZMY_MSGS',
      msgno: '001',
      message: {
        msgno: '001',
        msgtext: 'Hello &1',
        selfexplainatory: 'true',
        documented: 'true',
        lastchangedby: 'SAPUSER01',
        lastmodified: '2021-02-03T04:05:06Z',
        name: 'ZMY_MSGS001',
      },
    });
    // Nothing of the other messages, and not the document.
    const text = result.content[0].text;
    expect(text).not.toContain('First');
    expect(text).not.toContain('Third');
    expect(text).not.toContain('mc:messageClass');
  });

  it('GetMessageClassMessage full adds the element as parsed, its links included', async () => {
    const answered = payload(await readMessage('full'));
    expect(answered.message.msgno).toBe('001');
    expect(answered.element['@']['mc:msgno']).toBe('001');
    expect(JSON.stringify(answered.element)).toContain('messages/001/longtext');
    expect(JSON.stringify(answered)).not.toContain('Third');
  });

  it('GetMessageClassMessage raw answers the class document as SAP sent it', async () => {
    const result = await readMessage('raw');
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toBe(classDocument);
  });

  it('GetMessageClassMessage reads the message whatever the prefix, one message or many', async () => {
    // Another prefix for the same namespace, and a class of one message: the
    // real refusal reads local names, so the extraction must too.
    const single =
      '<m:messageClass xmlns:m="http://www.sap.com/adt/MessageClass" xmlns:a="http://www.sap.com/adt/core" a:name="ZMY_MSGS">' +
      '<m:messages m:msgno="001" m:msgtext="Only" m:selfexplainatory="false" a:name="ZMY_MSGS001"/></m:messageClass>';
    const { analyseMessageClassMessage } = jest.requireActual(
      '@mcp-abap-adt/adt-strategies',
    );
    const { ADT_NO_FAILURE } = jest.requireActual(
      '@mcp-abap-adt/interfaces-adt',
    );
    expect(
      analyseMessageClassMessage('001')(ADT_NO_FAILURE, {
        status: 200,
        data: single,
      }),
    ).toBe(ADT_NO_FAILURE);
    mockMsg.read.mockResolvedValue(okResponse(single));
    const result = await handleGetMessageClassMessage(ctx, {
      message_class_name: 'zmy_msgs',
      msgno: '001',
    });
    expect(result.isError).toBe(false);
    expect(payload(result).message).toEqual({
      msgno: '001',
      msgtext: 'Only',
      selfexplainatory: 'false',
      name: 'ZMY_MSGS001',
    });
  });

  it.each([
    ['an empty body', ''],
    ['a body that is not XML', 'not a document'],
    ['another document', '<other:root xmlns:other="urn:x"/>'],
  ])(
    'GetMessageClassMessage: the strategy refuses %s, the handler decides nothing',
    async (_what, body) => {
      const { analyseMessageClassMessage } = jest.requireActual(
        '@mcp-abap-adt/adt-strategies',
      );
      const { ADT_NO_FAILURE } = jest.requireActual(
        '@mcp-abap-adt/interfaces-adt',
      );
      const verdict = analyseMessageClassMessage('001')(ADT_NO_FAILURE, {
        status: 200,
        data: body,
      });
      expect(verdict).not.toBe(ADT_NO_FAILURE);
      expect(verdict.code).toBe('ADT_OBJECT_NOT_FOUND');
      // A strategy that clears it is the consumer's choice: the handler
      // answers what it read, without a failure of its own.
      mockMsg.read.mockResolvedValue(okResponse(body));
      const result = await handleGetMessageClassMessage(ctx, {
        message_class_name: 'zmy_msgs',
        msgno: '001',
      });
      expect(result.isError).toBe(false);
      expect(payload(result).message).toBeUndefined();
    },
  );

  it('GetMessageClassMessage refuses a number the class does not hold', async () => {
    // The real strategy over the real document: `analyseMessageClassMessage`
    // is what refuses, before any projection.
    const { analyseMessageClassMessage } = jest.requireActual(
      '@mcp-abap-adt/adt-strategies',
    );
    const { ADT_NO_FAILURE } = jest.requireActual(
      '@mcp-abap-adt/interfaces-adt',
    );
    const verdict = analyseMessageClassMessage('999')(ADT_NO_FAILURE, {
      status: 200,
      data: classDocument,
    });
    expect(verdict).not.toBe(ADT_NO_FAILURE);
    expect(
      analyseMessageClassMessage('001')(ADT_NO_FAILURE, {
        status: 200,
        data: classDocument,
      }),
    ).toBe(ADT_NO_FAILURE);
  });
});
