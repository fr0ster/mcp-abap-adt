/**
 * Unit tests: Message Class (MSAG) CRUD tools.
 *  - the message-class handlers dispatch to client.getMessageClass()
 *    with the right config (name uppercased, package, transport, master lang);
 *  - the message handlers dispatch to client.getMessageClassMessage()
 *    with { className, msgno, msgtext, ... };
 *  - read handlers surface the parsed messageClass / message.
 * SAP-free via a mocked AdtClient.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import { handleCreateMessageClass } from '../../handlers/message_class/high/handleCreateMessageClass';
import { handleCreateMessageClassMessage } from '../../handlers/message_class/high/handleCreateMessageClassMessage';
import { handleDeleteMessageClass } from '../../handlers/message_class/high/handleDeleteMessageClass';
import { handleGetMessageClass } from '../../handlers/message_class/high/handleGetMessageClass';
import { handleGetMessageClassMessage } from '../../handlers/message_class/high/handleGetMessageClassMessage';
import { handleUpdateMessageClassMessage } from '../../handlers/message_class/high/handleUpdateMessageClassMessage';
import * as clients from '../../lib/clients';
import { parseStructure } from '../../lib/strategies/reading';
import { assertMatchObject } from '../helpers/assertions';
import { okResponse, reading } from '../helpers/fakeClient';

const mockMc = {
  create: mock.fn<(...args: any[]) => any>(),
  read: mock.fn<(...args: any[]) => any>(),
  readMetadata: mock.fn<(...args: any[]) => any>(),
  update: mock.fn<(...args: any[]) => any>(),
  checkDeletion: mock.fn<(...args: any[]) => any>(),
  delete: mock.fn<(...args: any[]) => any>(),
  lock: mock.fn<(...args: any[]) => any>(),
  unlock: mock.fn<(...args: any[]) => any>(),
};
const mockMsg = {
  read: mock.fn<(...args: any[]) => any>(),
  lockMessage: mock.fn<(...args: any[]) => any>(),
  lockClassForMessage: mock.fn<(...args: any[]) => any>(),
  update: mock.fn<(...args: any[]) => any>(),
  unlockMessages: mock.fn<(...args: any[]) => any>(),
};

/** The lock window answering clean: the class read, both handles, unlocks. */
function windowAnswers(): void {
  mockMc.readMetadata.mock.mockImplementation(async () =>
    okResponse('<mc:messageClass/>'),
  );
  mockMsg.lockMessage.mock.mockImplementation(async () =>
    okResponse('MESSAGEHANDLE'),
  );
  mockMsg.lockClassForMessage.mock.mockImplementation(async () =>
    okResponse('CLASSHANDLE'),
  );
  mockMc.unlock.mock.mockImplementation(async () => okResponse(undefined));
  mockMsg.unlockMessages.mock.mockImplementation(async () =>
    okResponse(undefined),
  );
}

/** The PUT's options as the window hands them over, the reading aside. */
function putOptionsOf(options: any) {
  const { headers, analyse, ...rest } = options;
  return {
    rest,
    headers: typeof headers?.accept === 'string',
    analyse: typeof analyse === 'function',
  };
}

// Read untyped: the cases hand the
// strategy a bare { status, data }.
const { analyseMessageClassMessage } = require('@mcp-abap-adt/adt-strategies');
const { ADT_NO_FAILURE } = require('@mcp-abap-adt/interfaces-adt');

mock.method(clients, 'createAdtClient', () => ({
  getMessageClass: () => mockMc,
  getMessageClassMessage: () => mockMsg,
}));

const ctx = { connection: {}, logger: undefined } as any;

function payload(result: any) {
  const text =
    (result.content.find((c: any) => c.type === 'text') as any)?.text || '';
  return JSON.parse(text);
}

describe('Message Class (MSAG) CRUD tools', () => {
  beforeEach(() => {
    for (const m of [mockMc, mockMsg]) {
      for (const fn of Object.values(m)) {
        fn.mock.resetCalls();
        fn.mock.mockImplementation(() => undefined);
      }
    }
  });

  // adt-clients 19: a message class has no source resource of its own, so
  // `read` is gone and `readMetadata` answers the whole document verbatim
  // (see `handleGetMessageClass.ts`) — there is no longer a parsed
  // `messageClass.messages[]` to assert against, only the raw document.
  it('GetMessageClass answers the class document via readMetadata', async () => {
    const metadata =
      '<msag:messageClass adtcore:name="ZMY_MSGS">...</msag:messageClass>';
    mockMc.readMetadata.mock.mockImplementation(async () =>
      okResponse(reading(metadata)),
    );

    const result = await handleGetMessageClass(ctx, {
      message_class_name: 'zmy_msgs',
    });

    assert.equal(result.isError, false);
    assert.ok(
      mockMc.readMetadata.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], { name: 'ZMY_MSGS' }) &&
          typeof a[1]?.analyse === 'function',
      ),
    );
    assert.equal(payload(result).metadata, metadata);
  });

  // GetMessageClass calls readMetadata, not read (task 18: `.read()` does
  // not exist on `IMessageClassContract` in v19 — see
  // `handleGetMessageClass.ts`'s own comment). A `readMetadata` answering
  // `undefined` is not a shape `answer()`'s adapter can destructure, so it
  // surfaces as a local `client_threw`/`adapter_threw` failure rather than
  // a structured "not found" — still `isError: true`, for a different
  // reason than this test's name once assumed.
  it('GetMessageClass surfaces an error when readMetadata returns undefined', async () => {
    mockMc.readMetadata.mock.mockImplementation(async () => undefined);
    const result = await handleGetMessageClass(ctx, {
      message_class_name: 'ZNOPE',
    });
    assert.equal(result.isError, true);
  });

  // Task 20: `create()` is one request now (adt-clients 18's fat workflow —
  // validate/create/check — is gone), answered through `answer()`/
  // `IAdtResponse`, not the old `{ createResult }` state bag.
  it('CreateMessageClass dispatches create() with camelCase config', async () => {
    mockMc.create.mock.mockImplementation(async () =>
      okResponse(reading(undefined, '', 201)),
    );

    const result = await handleCreateMessageClass(ctx, {
      message_class_name: 'zmy_msgs',
      description: 'My messages',
      package_name: '$TMP',
      master_language: 'EN',
    });

    assert.equal(result.isError, false);
    assert.ok(
      mockMc.create.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], {
            name: 'ZMY_MSGS',
            description: 'My messages',
            packageName: '$TMP',
            transportRequest: undefined,
            masterLanguage: 'EN',
          }) &&
          typeof a[1]?.analyse === 'function',
      ),
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
    mockMc.checkDeletion.mock.mockImplementation(async () =>
      okResponse(reading(parseStructure(checkDoc), checkDoc, 200)),
    );
    mockMc.delete.mock.mockImplementation(async () =>
      okResponse(reading(parseStructure(deletionDoc), deletionDoc, 200)),
    );

    const result = await handleDeleteMessageClass(ctx, {
      message_class_name: 'ZMY_MSGS',
      transport_request: 'SIDK900001',
    });

    assert.equal(result.isError, false);
    assert.ok(
      mockMc.checkDeletion.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], {
            name: 'ZMY_MSGS',
            transportRequest: 'SIDK900001',
          }) &&
          typeof a[1]?.analyse === 'function',
      ),
    );
    assert.ok(
      mockMc.delete.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 2 &&
          isDeepStrictEqual(a[0], {
            name: 'ZMY_MSGS',
            transportRequest: 'SIDK900001',
          }) &&
          typeof a[1]?.analyse === 'function',
      ),
    );
    assertMatchObject(payload(result), {
      deleted: true,
      object: 'ZMY_MSGS',
    });
  });

  // adt-clients 48: the message's members are one request each, and the
  // lock window is the server's (`lib/messageClassMessageWrite.ts`): the
  // PUT is `update`, sent with the class document and both handles.
  it('CreateMessageClassMessage writes the message through update() inside the lock window', async () => {
    windowAnswers();
    mockMsg.update.mock.mockImplementation(async () => okResponse(''));

    const result = await handleCreateMessageClassMessage(ctx, {
      message_class_name: 'zmy_msgs',
      msgno: '001',
      msgtext: 'Hello &1',
      self_explanatory: true,
      transport_request: 'SIDK900001',
    });

    assert.equal(result.isError, false);
    assert.equal(mockMsg.update.mock.calls.length, 1);
    const [config, options] = mockMsg.update.mock.calls[0]?.arguments ?? [];
    assert.deepStrictEqual(config, {
      className: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Hello &1',
      selfExplanatory: true,
      description: undefined,
      transportRequest: 'SIDK900001',
    });
    assert.deepStrictEqual(putOptionsOf(options), {
      rest: {
        classDocument: '<mc:messageClass/>',
        classLockHandle: 'CLASSHANDLE',
        messageLockHandle: 'MESSAGEHANDLE',
      },
      headers: true,
      analyse: true,
    });
    assert.equal(mockMc.unlock.mock.calls.length, 1);
    assert.equal(mockMsg.unlockMessages.mock.calls.length, 1);
  });

  it('UpdateMessageClassMessage writes the new text through update() inside the lock window', async () => {
    windowAnswers();
    mockMsg.update.mock.mockImplementation(async () => okResponse(''));

    const result = await handleUpdateMessageClassMessage(ctx, {
      message_class_name: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Updated &1',
    });

    assert.equal(result.isError, false);
    assert.equal(mockMsg.update.mock.calls.length, 1);
    assert.deepStrictEqual(mockMsg.update.mock.calls[0]?.arguments[0], {
      className: 'ZMY_MSGS',
      msgno: '001',
      msgtext: 'Updated &1',
      selfExplanatory: undefined,
      description: undefined,
      transportRequest: undefined,
    });
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
    mockMsg.read.mock.mockImplementation(async () => okResponse(classDocument));
    return handleGetMessageClassMessage(ctx, {
      message_class_name: 'zmy_msgs',
      msgno: '001',
      ...(detail !== undefined ? { detail } : {}),
    } as any);
  };

  it('GetMessageClassMessage answers the one message, read from the class document', async () => {
    const result = await readMessage();

    assert.equal(result.isError, false);
    assert.ok(
      mockMsg.read.mock.calls.some(
        ({ arguments: a }: { arguments: any[] }) =>
          a.length === 3 &&
          isDeepStrictEqual(a[0], {
            className: 'ZMY_MSGS',
            msgno: '001',
          }) &&
          isDeepStrictEqual(a[1], 'active') &&
          typeof a[2]?.analyse === 'function',
      ),
    );
    assert.deepStrictEqual(payload(result), {
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
    assert.ok(!text.includes('First'));
    assert.ok(!text.includes('Third'));
    assert.ok(!text.includes('mc:messageClass'));
  });

  it('GetMessageClassMessage full adds the element as parsed, its links included', async () => {
    const answered = payload(await readMessage('full'));
    assert.equal(answered.message.msgno, '001');
    assert.equal(answered.element['@']['mc:msgno'], '001');
    assert.ok(
      JSON.stringify(answered.element).includes('messages/001/longtext'),
    );
    assert.ok(!JSON.stringify(answered).includes('Third'));
  });

  it('GetMessageClassMessage raw answers the class document as SAP sent it', async () => {
    const result = await readMessage('raw');
    assert.equal(result.isError, false);
    assert.equal(result.content[0].text, classDocument);
  });

  it('GetMessageClassMessage reads the message whatever the prefix, one message or many', async () => {
    // Another prefix for the same namespace, and a class of one message: the
    // real refusal reads local names, so the extraction must too.
    const single =
      '<m:messageClass xmlns:m="http://www.sap.com/adt/MessageClass" xmlns:a="http://www.sap.com/adt/core" a:name="ZMY_MSGS">' +
      '<m:messages m:msgno="001" m:msgtext="Only" m:selfexplainatory="false" a:name="ZMY_MSGS001"/></m:messageClass>';
    assert.equal(
      analyseMessageClassMessage('001')(ADT_NO_FAILURE, {
        status: 200,
        data: single,
      }),
      ADT_NO_FAILURE,
    );
    mockMsg.read.mock.mockImplementation(async () => okResponse(single));
    const result = await handleGetMessageClassMessage(ctx, {
      message_class_name: 'zmy_msgs',
      msgno: '001',
    });
    assert.equal(result.isError, false);
    assert.deepStrictEqual(payload(result).message, {
      msgno: '001',
      msgtext: 'Only',
      selfexplainatory: 'false',
      name: 'ZMY_MSGS001',
    });
  });

  for (const [_what, body] of [
    ['an empty body', ''],
    ['a body that is not XML', 'not a document'],
    ['another document', '<other:root xmlns:other="urn:x"/>'],
  ]) {
    it(
      format(
        'GetMessageClassMessage: the strategy refuses %s, the handler decides nothing',
        _what,
      ),
      async () => {
        const verdict = analyseMessageClassMessage('001')(ADT_NO_FAILURE, {
          status: 200,
          data: body,
        });
        assert.notEqual(verdict, ADT_NO_FAILURE);
        assert.equal(verdict.code, 'ADT_OBJECT_NOT_FOUND');
        // A strategy that clears it is the consumer's choice: the handler
        // answers what it read, without a failure of its own.
        mockMsg.read.mock.mockImplementation(async () => okResponse(body));
        const result = await handleGetMessageClassMessage(ctx, {
          message_class_name: 'zmy_msgs',
          msgno: '001',
        });
        assert.equal(result.isError, false);
        assert.equal(payload(result).message, undefined);
      },
    );
  }

  it('GetMessageClassMessage refuses a number the class does not hold', async () => {
    // The real strategy over the real document: `analyseMessageClassMessage`
    // is what refuses, before any projection.
    const verdict = analyseMessageClassMessage('999')(ADT_NO_FAILURE, {
      status: 200,
      data: classDocument,
    });
    assert.notEqual(verdict, ADT_NO_FAILURE);
    assert.equal(
      analyseMessageClassMessage('001')(ADT_NO_FAILURE, {
        status: 200,
        data: classDocument,
      }),
      ADT_NO_FAILURE,
    );
  });
});
