/**
 * The two leftover-session tools: list and log off
 * the SAP sessions a killed process left, through an MCP client, against
 * the ADT stand-in. Each tool answers only for the caller's own sessions —
 * those of the destination the instance serves; another destination's file
 * and an unknown handle get the same answer — and never for a live
 * process's. Logoff sends the ICF logoff with the session's cookies and no
 * `Authorization`, and deletes the file only once that logoff completed (its
 * `flushGoodbye()` settled); until then the file stays claimed. (The resume is a stdio start's:
 * `startBirth.test.ts`.)
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import { AdtOnPremConnector } from '@mcp-abap-adt/connection';
import { LEFTOVER_LOGOFF_NOT_COMPLETED_WORDS } from '../../../embeddable/BaseMcpServer';
import { LEFTOVER_SESSION_NOT_AVAILABLE_WORDS } from '../../../lib/auth/serverRefusal';
import { isLogoff, PROBE_PATH } from '../../helpers/adtStandIn';
import { assertMatchObject } from '../../helpers/assertions';
import {
  DESTINATION,
  json,
  type LeftoverStand,
  leftoverStand,
  OUR_PID,
  until,
} from './harness';

let stand: LeftoverStand;

beforeEach(() => {
  mock.method(process.stderr, 'write', () => true);
});

/** Held logoff answers, let go before the close (which awaits them). */
const heldAnswers: Array<() => void> = [];

afterEach(async () => {
  for (const release of heldAnswers.splice(0)) release();
  await stand?.close();
  mock.restoreAll();
});

describe('ListLeftoverSessions', () => {
  it("lists the caller's sessions of dead processes, without a cookie", async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    const answer = await stand.call('ListLeftoverSessions');
    assert.equal(answer.isError, false);
    const listed = json(answer.text).sessions as Array<Record<string, unknown>>;
    // expect.any(String): the field's type, then the equality over the rest.
    assert.equal(typeof listed[0]?.written_at, 'string');
    assert.deepStrictEqual(listed, [
      {
        handle,
        role: 'built',
        destination: {
          name: DESTINATION,
          url: stand.standIn.url,
          client: '100',
          system: 'onprem',
        },
        user: 'LEFT_USER',
        written_at: listed[0]?.written_at,
      },
    ]);
    assert.ok(!answer.text.includes('SAP_SESSIONID'));
    assert.ok(!answer.text.includes('session-'));
  });

  it("hides a live process's file and another destination's", async () => {
    stand = await leftoverStand();
    stand.alive.add(333);
    await stand.leftover({ pid: 333 });
    await stand.leftover({ destination: 'OTHER_DEST' });
    const mine = await stand.leftover({ role: 'debugger' });
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as Array<{ handle: string; role: string }>;
    assert.deepStrictEqual(
      listed.map((s) => s.handle),
      [mine.handle],
    );
    assert.equal(listed[0]?.role, 'debugger');
  });

  it('matches on the destination, not on the user: who calls is the destination the instance serves', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover({ user: 'OTHER_USER' });
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as Array<{ handle: string; user: string }>;
    assertMatchObject(listed, [{ handle, user: 'OTHER_USER' }]);
  });

  it('lists none of its own process’s files: they belong to a running process', async () => {
    stand = await leftoverStand();
    // This instance's own connection: its file is this (live) process's.
    await stand.call('ProbeAdt', { id: 'own' });
    assert.equal(stand.files().length, 1);
    const listed = json((await stand.call('ListLeftoverSessions')).text)
      .sessions as unknown[];
    assert.deepStrictEqual(listed, []);
  });

  it('is not available on an instance whose host gave no owner', async () => {
    stand = await leftoverStand({ noOwner: true });
    await stand.leftover();
    const answer = await stand.call('ListLeftoverSessions');
    assert.equal(answer.isError, true);
    assert.equal(json(answer.text).error, 'leftover_sessions_unavailable');
  });
});

describe('LogoffLeftoverSession', () => {
  it('sends the ICF logoff with the session’s cookies and no credential, then deletes the file', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover({ role: 'debugger' });
    const from = stand.standIn.requests.length;
    const answer = await stand.call('LogoffLeftoverSession', { handle });
    assert.equal(answer.isError, false);
    assert.deepStrictEqual(json(answer.text), { handle, state: 'logged_off' });
    // Written when the tool answered; the stand-in reads it a moment later.
    await until(() => stand.standIn.logoffs() === 1);
    const sent = stand.standIn.requests.slice(from);
    const logoff = sent.find((r) => isLogoff(r.url));
    assert.equal(logoff?.session, session);
    assert.ok(logoff?.cookie?.includes(`=${session}`));
    for (const r of sent) assert.equal(r.authorization, undefined);
    assert.deepStrictEqual(stand.files(), []);
  });

  it('sends exactly one request — the logoff: no discovery, no CSRF fetch, no credential, no prepare()', async (t) => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    const prepare = t.mock.method(BasicAuthProvider.prototype, 'prepare');
    const from = stand.standIn.requests.length;
    const answer = await stand.call('LogoffLeftoverSession', { handle });
    assert.deepStrictEqual(json(answer.text), { handle, state: 'logged_off' });
    await until(() => stand.standIn.logoffs() === 1);
    const sent = stand.standIn.requests.slice(from);
    assert.equal(sent.length, 1);
    assert.equal(isLogoff(sent[0]?.url ?? ''), true);
    assert.equal(sent[0]?.authorization, undefined);
    assert.equal(prepare.mock.callCount(), 0);
    assert.deepStrictEqual(stand.files(), []);
  });

  it('a session SAP already ended gets the logoff too; its answer is not read, and the file is deleted', async () => {
    stand = await leftoverStand();
    const { handle, session } = await stand.leftover();
    stand.standIn.answer((r) => r.session === session, 401);
    const answer = await stand.call('LogoffLeftoverSession', { handle });
    assert.deepStrictEqual(json(answer.text), { handle, state: 'logged_off' });
    assert.deepStrictEqual(stand.files(), []);
  });
});

describe('LogoffLeftoverSession: the file goes only once the logoff completed', () => {
  it('keeps the claimed file while the logoff is written and not answered; deletes it once answered', async () => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    const held = stand.standIn.hold((r) => isLogoff(r.url));
    heldAnswers.push(held.release);
    const answering = stand.call('LogoffLeftoverSession', { handle });
    await held.arrived;
    // Written, not answered: the record stays, claimed by this process.
    {
      const files = stand.files();
      assert.equal(files.length, 1);
      assert.match(
        files[0] ?? '',
        new RegExp(`^${handle}\\.claimed\\.${OUR_PID}\\.`),
      );
    }
    held.release();
    const answer = await answering;
    assert.deepStrictEqual(json(answer.text), { handle, state: 'logged_off' });
    assert.deepStrictEqual(stand.files(), []);
  });

  it('gives the file back as a leftover when the flush did not complete', async (t) => {
    stand = await leftoverStand();
    const { handle } = await stand.leftover();
    const notAnswered = new Error('not answered');
    t.mock.method(AdtOnPremConnector.prototype, 'flushGoodbye', async () => {
      throw notAnswered;
    });
    const answer = await stand.call('LogoffLeftoverSession', { handle });
    assert.equal(answer.isError, true);
    assert.ok(answer.text.includes(LEFTOVER_LOGOFF_NOT_COMPLETED_WORDS));
    assert.deepStrictEqual(stand.files(), [handle]);
  });
});

describe('a handle that is not the caller’s', () => {
  for (const tool of ['LogoffLeftoverSession']) {
    it(
      format(
        '%s answers an unknown, a foreign and a live one the same, sending nothing',
        tool,
      ),
      async () => {
        stand = await leftoverStand();
        const foreign = await stand.leftover({ destination: 'OTHER_DEST' });
        stand.alive.add(444);
        const live = await stand.leftover({ pid: 444 });
        const from = stand.standIn.requests.length;
        const answers = await Promise.all(
          [
            '0123456789abcdef0123456789abcdef',
            'not-a-handle',
            foreign.handle,
            live.handle,
          ].map((handle) => stand.call(tool, { handle })),
        );
        for (const answer of answers) {
          assert.equal(answer.isError, true);
          assert.equal(answer.text, answers[0]?.text);
        }
        assert.equal(
          json(answers[0]?.text ?? '').message,
          LEFTOVER_SESSION_NOT_AVAILABLE_WORDS,
        );
        assert.equal(stand.standIn.requests.length, from);
        assert.deepStrictEqual(
          stand.files(),
          [foreign.handle, live.handle].sort((a, b) => a.localeCompare(b)),
        );
      },
    );
  }
});
