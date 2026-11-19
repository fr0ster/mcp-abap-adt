/**
 * Unit tests: withCriticalSection / isMutatingToolName.
 * The wrapper must bracket a mutating handler with the connection's
 * begin/endCriticalSection() — including on throw — so a lock → modify →
 * unlock chain runs uninterruptibly. Feature-detected: a connection without
 * the methods is a no-op.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import {
  isMutatingToolName,
  withCriticalSection,
} from '../../lib/criticalSection';
import { assertRejects } from '../helpers/assertions';

describe('isMutatingToolName', () => {
  it('matches Create/Update/Delete tools', () => {
    for (const n of [
      'CreateDomain',
      'UpdateMessageClass',
      'DeleteMessageClassMessage',
    ]) {
      assert.equal(isMutatingToolName(n), true);
    }
  });

  it('matches AddTransportObject/RemoveTransportObject (#221, PR227)', () => {
    // Measured live: SAP's addobject/removeobject backend takes the same
    // ENQUEUE lock a Create/Update/Delete does before validating the
    // request — these two need the same critical section, or a slow call
    // orphans the lock exactly like an unprotected mutating tool would.
    for (const n of ['AddTransportObject', 'RemoveTransportObject']) {
      assert.equal(isMutatingToolName(n), true);
    }
  });
  it('matches MoveTransportObjects/SortAndCompressTransportTask, which write the same object list', () => {
    for (const n of ['MoveTransportObjects', 'SortAndCompressTransportTask']) {
      assert.equal(isMutatingToolName(n), true);
    }
  });
  it('does not match read/activate tools', () => {
    for (const n of ['GetDomain', 'GetTable', 'ActivateClass']) {
      assert.equal(isMutatingToolName(n), false);
    }
  });
});

describe('withCriticalSection', () => {
  it('calls begin before and end after the handler (success path)', async () => {
    const calls: string[] = [];
    const conn = {
      beginCriticalSection: () => calls.push('begin'),
      endCriticalSection: () => calls.push('end'),
    };
    const handler = async (_ctx: unknown, _args: unknown) => {
      calls.push('handler');
      return { ok: true };
    };

    const wrapped = withCriticalSection(
      handler,
      () => conn as unknown as IAbapConnection,
    );
    const res = await wrapped({} as any, {});

    assert.deepStrictEqual(res, { ok: true });
    assert.deepStrictEqual(calls, ['begin', 'handler', 'end']);
  });

  it('still calls end when the handler throws', async () => {
    const calls: string[] = [];
    const conn = {
      beginCriticalSection: () => calls.push('begin'),
      endCriticalSection: () => calls.push('end'),
    };
    const handler = async (_ctx: unknown, _args: unknown) => {
      calls.push('handler');
      throw new Error('boom');
    };

    const wrapped = withCriticalSection(
      handler,
      () => conn as unknown as IAbapConnection,
    );
    await assertRejects(wrapped({} as any, {}), 'boom');
    assert.deepStrictEqual(calls, ['begin', 'handler', 'end']);
  });

  it('is a no-op on a connection lacking the methods (older connection)', async () => {
    const handler = async () => 'ok';
    const wrapped = withCriticalSection(
      handler,
      () => ({}) as unknown as IAbapConnection,
    );
    assert.equal(await wrapped(), 'ok');
  });

  it('hands the handler exactly the arguments the wrapper is called with', async () => {
    const conn = {} as unknown as IAbapConnection;
    const counted = async (...args: unknown[]) => args.length;
    assert.equal(await withCriticalSection(counted, () => conn)(), 0);
    assert.equal(
      await withCriticalSection(counted, () => conn)({} as any, {}),
      2,
    );
  });
});
