/**
 * A server's `systemType` reaches every connection it builds (D26 B1, B7):
 * the logon, the leftover session taken up at the start, the leftover's
 * logoff and the runtime file's identity are built for the server's kind,
 * whatever `SAP_SYSTEM_TYPE` says — unset, or another kind — and the
 * server's logger reaches them. Without the option, `SAP_SYSTEM_TYPE`
 * answers. Against the ADT stand-in.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { systemKindOf } from '../../../lib/connectionFactory';
import { assertMatchObject } from '../../helpers/assertions';
import { type LeftoverStand, leftoverStand } from './harness';

let stand: LeftoverStand | undefined;
const previousType = process.env.SAP_SYSTEM_TYPE;

beforeEach(() => {
  mock.method(process.stderr, 'write', () => true);
});

afterEach(async () => {
  await stand?.close();
  stand = undefined;
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
  mock.restoreAll();
  resetProcessLatchForTests();
});

/** A leftover made while `SAP_SYSTEM_TYPE` says onprem, as the killed process had it. */
async function leftoverWith(made: LeftoverStand) {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  const left = await made.leftover();
  return left;
}

describe('systemType onprem, SAP_SYSTEM_TYPE unset', () => {
  it('the logon at the start builds an on-premise connection', async () => {
    delete process.env.SAP_SYSTEM_TYPE;
    stand = await leftoverStand({ systemType: 'onprem' });
    assert.deepStrictEqual(await stand.start(), { session: 'logged_on' });
    assert.equal(stand.files().length, 1);
    const [handle] = stand.files();
    assertMatchObject(stand.file(handle ?? ''), {
      destination: { system: 'onprem' },
    });
  });

  it('the leftover session is taken up, not refused system_type_required', async () => {
    stand = await leftoverStand({ systemType: 'onprem' });
    const { handle } = await leftoverWith(stand);
    delete process.env.SAP_SYSTEM_TYPE;
    assert.deepStrictEqual(await stand.start(), {
      session: 'picked_up',
      handle,
    });
  });

  it("a leftover's logoff is sent, not refused system_type_required", async () => {
    stand = await leftoverStand({ systemType: 'onprem' });
    const { handle } = await leftoverWith(stand);
    // A second session: neither is taken up, both stay for the logoff.
    await stand.leftover({ pid: 333 });
    delete process.env.SAP_SYSTEM_TYPE;
    await stand.start();
    const off = await stand.call('LogoffLeftoverSession', { handle });
    assert.equal(off.isError, false);
    assert.ok(off.text.includes('logged_off'));
  });
});

it('systemType cloud with SAP_SYSTEM_TYPE=onprem: the logon and its file are cloud', async () => {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  stand = await leftoverStand({ systemType: 'cloud' });
  await stand.start();
  const [handle] = stand.files();
  assertMatchObject(stand.file(handle ?? ''), {
    destination: { system: 'cloud' },
  });
  const connection = await stand.server.connectionForTest();
  assert.equal(systemKindOf(connection), 'cloud');
});

it('without systemType, SAP_SYSTEM_TYPE answers', async () => {
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  stand = await leftoverStand();
  await stand.start();
  const [handle] = stand.files();
  assertMatchObject(stand.file(handle ?? ''), {
    destination: { system: 'cloud' },
  });
});

it("the server's logger reaches the connection it builds", async () => {
  delete process.env.SAP_SYSTEM_TYPE;
  const lines: string[] = [];
  const record = (message: string) => {
    lines.push(message);
  };
  stand = await leftoverStand({
    systemType: 'onprem',
    logger: { info: record, debug: record, warn: record, error: record },
  });
  await stand.start();
  const connection = await stand.server.connectionForTest();
  const before = lines.length;
  await connection.makeAdtRequest({
    url: '/sap/bc/adt/probe/logger',
    method: 'GET',
    timeout: 10_000,
  });
  // The connection's own wire lines name the request it sent.
  assert.equal(
    lines
      .slice(before)
      .some((line) => line.includes('/sap/bc/adt/probe/logger')),
    true,
  );
});
