/**
 * Batch mode on stdio is the one instance's (spec §2, §8): the owner the
 * launcher gives the process's one instance is the batch every call of the
 * session reaches, and the client's close — the instance close — drops it
 * with nothing sent.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { InstanceBatch } from '@mcp-abap-adt/lib/embeddable';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { CompactReadOnlyHandlersGroup } from '../../../../compact-readonly-entries/src/group';
import { isLogoff } from '../../../../src/__tests__/helpers/adtStandIn';
import { assertMatchObject } from '../../../../src/__tests__/helpers/assertions';
import { CompactBatchHandlersGroup } from '../../../../src/lib/compact/batch/group';
import { stand, turns, until } from './helpers/loginStand';

const placeholder = { connection: undefined } as unknown as HandlerContext;

beforeEach(() => {
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

it("stdio: the batch is the one instance's; the client's close drops it with nothing sent", async () => {
  const owner = new InstanceBatch({ keepRawParts: false });
  const s = await stand({
    kind: 'onprem',
    batch: owner,
    groups: [
      new CompactReadOnlyHandlersGroup(placeholder),
      new CompactBatchHandlersGroup(placeholder),
    ],
  });
  try {
    assertMatchObject(await s.callTool('HandlerBatch', { action: 'begin' }), {
      isError: false,
    });
    assert.equal(owner.mode(), 'communication');
    assert.deepStrictEqual(
      await s.callTool('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'PROG_A',
      }),
      {
        text: '',
        isError: false,
      },
    );
    assert.deepStrictEqual(
      await s.callTool('HandlerGet', {
        object_type: 'INTERFACE',
        interface_name: 'IF_A',
      }),
      {
        text: '',
        isError: false,
      },
    );
    // Both calls of the session recorded into the one instance's batch.
    assert.deepStrictEqual(
      owner.opened()?.recorded.map((call) => call.number),
      [1, 2],
    );
    const signal = owner.signal();

    await s.client.close();
    await until(() => owner.mode() === 'off');
    assert.equal(signal.aborted, true);
    assert.equal(owner.holdsState(), false);
    await until(() => s.adt.logoffs() === 1);
    await turns(20);
    assert.deepStrictEqual(
      s.adt.requests.filter((r) => r.url.includes('/communication/batch')),
      [],
    );
    assert.equal(s.adt.requests.filter((r) => isLogoff(r.url)).length, 1);
  } finally {
    await s.close();
  }
});
