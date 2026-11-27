/**
 * The message write's lock window (adt-clients 48: one request per member,
 * the chain the caller's — `lib/messageClassMessageWrite.ts`), driven
 * through the three tool handlers and a real `AdtClient` over a connection
 * that records every request with the session type it went out on:
 *
 * - the requests the library's own chain sent before 48, in its order: the
 *   class read, `LOCK_MSG`, the class lock for the message, the PUT, the
 *   class `UNLOCK`, `UNLOCK_ALL` — the locks and unlocks stateful, the read
 *   and the PUT stateless;
 * - the two `403` fallbacks: no message lock (the class handle stands in on
 *   the PUT), and the plain class lock;
 * - every lock given up on every way out, class first, and the first error
 *   thrown the one that leaves.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  IAbapConnection,
  IAbapRequestOptions,
  IAdtWireResponse,
} from '@mcp-abap-adt/interfaces-adt-connection';
import { handleCreateMessageClassMessage } from '../../handlers/message_class/high/handleCreateMessageClassMessage';
import { handleDeleteMessageClassMessage } from '../../handlers/message_class/high/handleDeleteMessageClassMessage';
import { handleUpdateMessageClassMessage } from '../../handlers/message_class/high/handleUpdateMessageClassMessage';
import { DEFAULT_ADT_HEADERS } from '../../lib/adtHeaders/defaultPairs';
import { createAdtClient } from '../../lib/clients';
import { inMessageClassMessageWindow } from '../../lib/messageClassMessageWrite';
import { resetSystemContextCache } from '../../lib/systemContext';
import { setSystemContext } from '../helpers/processSystemContext';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const BASE = '/sap/bc/adt/messageclass/zmc';

const lockAnswer = (handle: string) =>
  '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml">' +
  `<asx:values><DATA><LOCK_HANDLE>${handle}</LOCK_HANDLE>` +
  '<CORRNR/><CORRUSER/><CORRTEXT/><IS_LOCAL>X</IS_LOCAL></DATA></asx:values></asx:abap>';

const CLASS_DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<mc:messageClass adtcore:name="ZMC" adtcore:type="MSAG/N" xmlns:mc="http://www.sap.com/adt/MessageClass" xmlns:adtcore="http://www.sap.com/adt/core">' +
  '<mc:messages mc:msgno="000" mc:msgtext="Kept" mc:selfexplainatory="false" adtcore:name="ZMC000"/>' +
  '</mc:messageClass>';

/** The request's step, named by its method and action. */
function stepOf(request: IAbapRequestOptions): string {
  const url = request.url;
  if (request.method === 'GET') return 'read';
  if (request.method === 'PUT') return 'put';
  if (url.includes('_action=LOCK_MSG')) return 'lockMessage';
  if (url.includes('_action=LOCK&') && url.includes('msgNo=')) {
    return 'lockClassForMessage';
  }
  if (url.includes('_action=LOCK&')) return 'lockClass';
  if (url.includes('_action=UNLOCK_ALL')) return 'unlockMessages';
  if (url.includes('_action=UNLOCK&')) return 'unlockClass';
  return `${request.method} ${url}`;
}

interface Sent {
  readonly step: string;
  readonly session: 'stateful' | 'stateless';
  readonly url: string;
  readonly data: unknown;
}

type Answer =
  | { readonly status: number; readonly data?: string }
  | { readonly throws: unknown };

/** A connection answering each step as `answers` names, recording all. */
function windowConnection(answers: Partial<Record<string, Answer>> = {}) {
  const sent: Sent[] = [];
  let session: 'stateful' | 'stateless' = 'stateless';
  const standard: Record<string, string> = {
    read: CLASS_DOCUMENT,
    lockMessage: lockAnswer('MESSAGEHANDLE'),
    lockClassForMessage: lockAnswer('CLASSHANDLE'),
    lockClass: lockAnswer('PLAINHANDLE'),
  };
  const connection: IAbapConnection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType(type) {
      session = type;
    },
    async makeAdtRequest(
      request: IAbapRequestOptions,
    ): Promise<IAdtWireResponse> {
      const step = stepOf(request);
      sent.push({ step, session, url: request.url, data: request.data });
      const answer = answers[step];
      if (answer !== undefined && 'throws' in answer) throw answer.throws;
      return {
        status: answer?.status ?? 200,
        statusText: 'OK',
        headers: {},
        data: answer?.data ?? standard[step] ?? '',
      };
    },
  };
  return { connection, sent };
}

/** A credential refusal the connection throws: adt-clients rethrows it. */
function refusal(reason: string) {
  return { refusal: { kind: 'credential', reason }, at: 'connection' };
}

const steps = (sent: readonly Sent[]) => sent.map((s) => s.step);
const sessions = (sent: readonly Sent[]) =>
  sent.map((s) => `${s.step}:${s.session}`);

/** The upsert itself, outside a tool: what it throws reaches the caller. */
const upsert = (connection: IAbapConnection) => {
  const message = { className: 'ZMC', msgno: '001', msgtext: 'x' };
  return inMessageClassMessageWindow(
    createAdtClient(connection),
    message,
    (members, window) =>
      members.update(message, {
        ...window,
        headers: DEFAULT_ADT_HEADERS['messageClassMessage.update'],
        analyse: analyseException,
      }),
  );
};

const create = (connection: IAbapConnection) =>
  handleCreateMessageClassMessage(
    { connection, logger: undefined },
    { message_class_name: 'zmc', msgno: '001', msgtext: 'New text' },
  );

describe('the message write: the lock window composed from one-request members', () => {
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  it('sends the old chain: read, both locks, the PUT, the class unlock, then the message unlock; locks stateful, read and PUT stateless', async () => {
    const { connection, sent } = windowConnection();
    const result = await create(connection);
    assert.equal(result.isError, false);
    assert.deepStrictEqual(sessions(sent), [
      'read:stateless',
      'lockMessage:stateful',
      'lockClassForMessage:stateful',
      'put:stateless',
      'unlockClass:stateful',
      'unlockMessages:stateful',
    ]);
    const [read, , , put, unlock] = sent;
    assert.ok(read?.url.includes('version=workingArea'));
    assert.ok(put?.url.startsWith(`${BASE}?lockHandle=CLASSHANDLE`));
    assert.ok(unlock?.url.includes('lockHandle=CLASSHANDLE'));
    const body = String(put?.data);
    assert.ok(body.includes('mc:lockhandle="MESSAGEHANDLE"'));
    assert.ok(body.includes('New text'));
    assert.ok(body.includes('Kept'), 'every other message stays');
  });

  it('UpdateMessageClassMessage sends the same window, its transport on the PUT', async () => {
    const { connection, sent } = windowConnection();
    const result = await handleUpdateMessageClassMessage(
      { connection, logger: undefined },
      {
        message_class_name: 'ZMC',
        msgno: '000',
        msgtext: 'Changed',
        transport_request: 'SIDK900001',
      },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(steps(sent), [
      'read',
      'lockMessage',
      'lockClassForMessage',
      'put',
      'unlockClass',
      'unlockMessages',
    ]);
    const put = sent[3];
    assert.ok(put?.url.endsWith('&corrNr=SIDK900001'));
    assert.ok(String(put?.data).includes('Changed'));
  });

  it('DeleteMessageClassMessage removes the message under deletedmessages, in the same window', async () => {
    const { connection, sent } = windowConnection();
    const result = await handleDeleteMessageClassMessage(
      { connection, logger: undefined },
      { message_class_name: 'ZMC', msgno: '000' },
    );
    assert.equal(result.isError, false);
    assert.deepStrictEqual(steps(sent), [
      'read',
      'lockMessage',
      'lockClassForMessage',
      'put',
      'unlockClass',
      'unlockMessages',
    ]);
    assert.ok(String(sent[3]?.data).includes('deletedmessages'));
  });

  it('a 403 on the message lock goes on: the class handle stands in on the PUT, and the messages are still unlocked', async () => {
    const { connection, sent } = windowConnection({
      lockMessage: { status: 403 },
    });
    const result = await create(connection);
    assert.equal(result.isError, false);
    assert.deepStrictEqual(steps(sent), [
      'read',
      'lockMessage',
      'lockClassForMessage',
      'put',
      'unlockClass',
      'unlockMessages',
    ]);
    assert.ok(String(sent[3]?.data).includes('mc:lockhandle="CLASSHANDLE"'));
  });

  it('a 403 on the class lock for the message takes the plain class lock, whose handle the PUT and the unlock carry', async () => {
    const { connection, sent } = windowConnection({
      lockClassForMessage: { status: 403 },
    });
    const result = await create(connection);
    assert.equal(result.isError, false);
    assert.deepStrictEqual(steps(sent), [
      'read',
      'lockMessage',
      'lockClassForMessage',
      'lockClass',
      'put',
      'unlockClass',
      'unlockMessages',
    ]);
    assert.ok(sent[4]?.url.includes('lockHandle=PLAINHANDLE'));
    assert.ok(sent[5]?.url.includes('lockHandle=PLAINHANDLE'));
  });

  it('a refused message lock other than 403 ends the call before anything is held', async () => {
    const { connection, sent } = windowConnection({
      lockMessage: { status: 500 },
    });
    const result = await create(connection);
    assert.equal(result.isError, true);
    assert.deepStrictEqual(steps(sent), ['read', 'lockMessage']);
  });

  it('a refused class read ends the call before any lock', async () => {
    const { connection, sent } = windowConnection({ read: { status: 404 } });
    const result = await create(connection);
    assert.equal(result.isError, true);
    assert.deepStrictEqual(steps(sent), ['read']);
  });

  it('a refused class lock gives the message lock up', async () => {
    const { connection, sent } = windowConnection({
      lockClassForMessage: { status: 500 },
    });
    const result = await create(connection);
    assert.equal(result.isError, true);
    assert.deepStrictEqual(steps(sent), [
      'read',
      'lockMessage',
      'lockClassForMessage',
      'unlockMessages',
    ]);
  });

  it('a refused PUT is the answer, and both locks are given up, the class first', async () => {
    const { connection, sent } = windowConnection({
      put: { status: 400, data: 'the PUT refusal' },
    });
    const result = await create(connection);
    assert.equal(result.isError, true);
    assert.deepStrictEqual(sessions(sent), [
      'read:stateless',
      'lockMessage:stateful',
      'lockClassForMessage:stateful',
      'put:stateless',
      'unlockClass:stateful',
      'unlockMessages:stateful',
    ]);
    const answer = await upsert(
      windowConnection({ put: { status: 400 } }).connection,
    );
    assert.equal(answer.ok, false);
    if (!answer.ok) assert.equal(answer.getError().response?.status, 400);
  });

  it("a refused PUT stays the answer when a cleanup's unlock is refused too: the PUT's 400, not the unlock's 500", async () => {
    const { connection, sent } = windowConnection({
      put: { status: 400, data: 'the PUT refusal' },
      unlockClass: { status: 500, data: 'the unlock refusal' },
    });
    const answer = await upsert(connection);
    assert.equal(answer.ok, false);
    if (!answer.ok) {
      const error = answer.getError();
      assert.equal(error.response?.status, 400);
      assert.equal(error.response?.data, 'the PUT refusal');
    }
    assert.deepStrictEqual(steps(sent), [
      'read',
      'lockMessage',
      'lockClassForMessage',
      'put',
      'unlockClass',
      'unlockMessages',
    ]);
  });

  it('a refused class unlock is the answer, and the class and the messages are given up again', async () => {
    const { connection, sent } = windowConnection({
      unlockClass: { status: 500, data: 'the unlock refusal' },
    });
    const answer = await upsert(connection);
    assert.equal(answer.ok, false);
    if (!answer.ok) {
      const error = answer.getError();
      assert.equal(error.response?.status, 500);
      assert.equal(error.response?.data, 'the unlock refusal');
    }
    assert.deepStrictEqual(steps(sent), [
      'read',
      'lockMessage',
      'lockClassForMessage',
      'put',
      'unlockClass',
      'unlockClass',
      'unlockMessages',
    ]);
    const tool = await create(
      windowConnection({ unlockClass: { status: 500 } }).connection,
    );
    assert.equal(tool.isError, true);
  });

  it('a throw at the PUT still gives every lock up, and the first error thrown leaves, not a later cleanup one', async () => {
    const first = refusal('the PUT was refused');
    const later = refusal('the class unlock was refused');
    let unlocks = 0;
    const { connection, sent } = windowConnection({ put: { throws: first } });
    const original = connection.makeAdtRequest.bind(connection);
    connection.makeAdtRequest = async (request) => {
      if (stepOf(request) === 'unlockClass') {
        unlocks += 1;
        sent.push({
          step: 'unlockClass',
          session: 'stateful',
          url: request.url,
          data: request.data,
        });
        throw later;
      }
      return original(request);
    };
    await assert.rejects(
      () => upsert(connection),
      (error: unknown) => error === first,
    );
    assert.equal(unlocks, 1);
    assert.deepStrictEqual(steps(sent), [
      'read',
      'lockMessage',
      'lockClassForMessage',
      'put',
      'unlockClass',
      'unlockMessages',
    ]);
  });

  it('a throw in a cleanup alone leaves as the error, after every other lock is given up', async () => {
    const thrown = refusal('the message unlock was refused');
    const { connection, sent } = windowConnection({
      put: { status: 400 },
      unlockMessages: { throws: thrown },
    });
    await assert.rejects(
      () => upsert(connection),
      (error: unknown) => error === thrown,
    );
    assert.deepStrictEqual(steps(sent), [
      'read',
      'lockMessage',
      'lockClassForMessage',
      'put',
      'unlockClass',
      'unlockMessages',
    ]);
  });
});
