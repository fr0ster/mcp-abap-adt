/**
 * Cleanup keeps what it owns (#394, review): a delete of an object nobody
 * recorded is still sent once; a lock a delete's own answer left behind is
 * taken in; a step that reports a lost session clears its connection's
 * locks — in `softSteps`, in `HighTester` and in `rapFixtures`' write.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ToolResultLike } from '../../../lib/toolResult';
import { heldLocksOf } from '../../integration/helpers/heldLiveLocks';
import { OwnedObjects } from '../../integration/helpers/ownedObjects';
import { writeAnswered } from '../../integration/helpers/rapFixtures';
import { softSteps } from '../../integration/helpers/softSteps';
import { softOutcomeApplied } from '../../integration/helpers/testers/HighTester';

const json = (payload: unknown, isError: boolean): ToolResultLike => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});
const cut = () =>
  json(
    { message: 'x', origin: 'connection', connection_cause: 'ECONNRESET' },
    true,
  );
const lost = () =>
  json(
    {
      error: 'client_threw',
      message: 'x',
      session_error: 'ADT_SESSION_REPLACED',
    },
    true,
  );
const leftBehind = (handle: string) =>
  json(
    {
      deleted: true,
      cleanup: {
        left_locked: true,
        lock_handle: handle,
        object: { type: 'CLASS', name: `ZCL_${handle}` },
      },
    },
    false,
  );
const lock = (handle: string) => ({
  object_type: 'CLASS',
  object_name: `ZCL_${handle}`,
  lock_handle: handle,
});

describe('OwnedObjects.delete of an object nobody recorded', () => {
  it('is marked delete-sent before it is sent, and never sent again', async () => {
    const owned = new OwnedObjects();
    let sent = 0;
    const send = async () => {
      sent += 1;
      return cut();
    };
    await owned.delete('ZCL_UNKNOWN', send);
    const again = await owned.delete('ZCL_UNKNOWN', send);
    assert.equal(sent, 1);
    assert.equal(again, undefined);
    assert.equal(owned.stillOwned[0]?.state, 'delete-sent');
  });
});

describe('softSteps keeps what its cleanup and its steps say', () => {
  it("cleanUp takes in a lock its delete's answer left behind", async () => {
    const connection = {};
    const steps = softSteps(connection, () => {});
    await steps.create('class', 'ZCL_A', 'create', async () =>
      json({ ok: 1 }, false),
    );
    await steps.cleanUp(['class'], { class: async () => leftBehind('DEL') });
    assert.deepEqual(
      heldLocksOf(connection).stillOwned.map((o) => [
        o.lock.lock_handle,
        o.state,
      ]),
      [['DEL', 'unlock-sent']],
    );
  });

  it("a step that reports a lost session clears the connection's locks", async () => {
    const connection = {};
    const steps = softSteps(connection, () => {});
    heldLocksOf(connection).hold(lock('H'));
    await assert.rejects(steps.must('write', async () => lost()));
    assert.equal(heldLocksOf(connection).stillHeld.length, 0);
  });
});

describe('HighTester applies a step outcome to its connection', () => {
  it('a lost session clears the locks; a left_locked answer is taken in', () => {
    const connection = {} as IAbapConnection;
    heldLocksOf(connection).hold(lock('H'));
    softOutcomeApplied(connection, 'session-lost', lost());
    assert.equal(heldLocksOf(connection).stillHeld.length, 0);
    softOutcomeApplied(connection, 'ok', leftBehind('DEL'));
    assert.deepEqual(
      heldLocksOf(connection).stillOwned.map((o) => o.lock.lock_handle),
      ['DEL'],
    );
  });
});

describe("rapFixtures' write", () => {
  it('a success whose unlock failed on the network is a failure, its lock held', () => {
    const connection = {};
    const failure = writeAnswered(connection, {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            result: 'SUCCESS',
            cleanup: {
              left_locked: true,
              lock_handle: 'W',
              object: { type: 'DDLS', name: 'ZV' },
              failures: [{ connection_cause: 'ECONNRESET' }],
            },
          }),
        },
      ],
    });
    assert.match(failure ?? '', /network/);
    assert.equal(heldLocksOf(connection).stillOwned[0]?.state, 'unlock-sent');
  });

  it('a lost session clears the locks and is a failure', () => {
    const connection = {};
    heldLocksOf(connection).hold(lock('V'));
    const failure = writeAnswered(connection, {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'client_threw',
            message: 'x',
            session_error: 'ADT_NOT_CONNECTED',
          }),
        },
      ],
    });
    assert.match(failure ?? '', /session-lost/);
    assert.equal(heldLocksOf(connection).stillHeld.length, 0);
  });

  it('an ok write is no failure', () => {
    assert.equal(
      writeAnswered(
        {},
        { isError: false, content: [{ type: 'text', text: 'SUCCESS' }] },
      ),
      undefined,
    );
  });
});
