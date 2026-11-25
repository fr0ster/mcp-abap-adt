/**
 * The deny list on HandlerLock's two actions (24.0.0: HandlerUnlock is
 * HandlerLock's action unlock): `HandlerLock.unlock` and `HandlerLock.lock`
 * each close their action — gone from the schema and refused before
 * anything is sent — and both together leave the tool out. The 23.x
 * spelling of the unlock never fails open: an entry that named the
 * HandlerUnlock tool (`HandlerUnlock`, a prefix of it) closes the unlock
 * action, and a value entry on it (`HandlerUnlock.CLASS`) stops the start.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compactToolSet } from '../../../../compact/src/launcher';
import {
  type DeniedActions,
  parseDeniedEntry,
} from '../../../lib/access/deniedActions';
import {
  unmatchedEntries,
  withoutDenied,
} from '../../../lib/access/withoutDenied';
import { ParameterRefusal } from '../../../lib/config/authParameters';
import type {
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import { listedJson } from '../../helpers/listedJson';
import { parityConnection, silentLogger } from '../../helpers/lowToCompact';

const denied = (...entries: string[]): DeniedActions =>
  entries.map((entry) => parseDeniedEntry(entry, 'test'));

const groups = (): IHandlerGroup[] =>
  compactToolSet.groups(noConnectionContext(), 'stdio', { dataTools: true });

const compact = (...entries: string[]) =>
  withoutDenied(groups(), denied(...entries));

function lockOf(narrowed: readonly IHandlerGroup[]): HandlerEntry | undefined {
  return narrowed
    .flatMap((group) => group.getHandlers())
    .find((entry) => entry.toolDefinition.name === 'HandlerLock');
}

function actionsOf(entry: HandlerEntry): string[] {
  const node = listedJson(entry.toolDefinition.inputSchema).properties?.action;
  if (node === undefined || typeof node === 'boolean') return [];
  if (node.const !== undefined) return [String(node.const)];
  return (node.enum ?? []).map(String);
}

/** Whether the narrowed call refuses `args` before anything is sent. */
async function refuses(entry: HandlerEntry, args: Record<string, unknown>) {
  const connection = parityConnection();
  await assert.rejects(
    entry.call({ connection, logger: silentLogger }, args),
    (error: unknown) =>
      error instanceof Error &&
      error.message.startsWith('Input validation error'),
  );
  assert.equal(connection.requests.length, 0);
}

const UNLOCK = {
  action: 'unlock',
  object_type: 'CLASS',
  object_name: 'ZCL_A',
  lock_handle: 'H',
};
const LOCK = { object_type: 'CLASS', object_name: 'ZCL_A' };

describe('the deny list on HandlerLock’s actions', () => {
  for (const entry of ['HandlerLock.unlock', 'HandlerUnlock', 'HandlerUn*']) {
    it(`${entry}: the unlock refused before anything is sent, the lock kept`, async () => {
      const lock = lockOf(compact(entry));
      assert.ok(lock !== undefined);
      assert.deepEqual(actionsOf(lock), ['lock']);
      await refuses(lock, UNLOCK);
      assert.equal(
        lock.toolDefinition.inputSchema.safeParse(LOCK).success,
        true,
      );
      assert.deepEqual(unmatchedEntries(groups(), denied(entry)), []);
    });
  }

  it('HandlerLock.lock: the lock refused, stated or by default; the unlock kept', async () => {
    const lock = lockOf(compact('HandlerLock.lock'));
    assert.ok(lock !== undefined);
    assert.deepEqual(actionsOf(lock), ['unlock']);
    await refuses(lock, LOCK);
    await refuses(lock, { ...LOCK, action: 'lock' });
    assert.equal(
      lock.toolDefinition.inputSchema.safeParse(UNLOCK).success,
      true,
    );
  });

  it('both actions denied leave HandlerLock out', () => {
    assert.equal(
      lockOf(compact('HandlerLock.lock', 'HandlerUnlock')),
      undefined,
    );
    assert.equal(
      lockOf(compact('HandlerLock.lock', 'HandlerLock.unlock')),
      undefined,
    );
  });

  it('a value entry on HandlerUnlock stops the start, naming HandlerLock', () => {
    for (const text of ['HandlerUnlock.CLASS', 'HandlerUnlock.CL*']) {
      assert.throws(
        () => parseDeniedEntry(text, 'MCP_DENY_ACTIONS'),
        (error: unknown) =>
          error instanceof ParameterRefusal &&
          error.message.includes('HandlerLock.unlock') &&
          error.message.includes('HandlerLock.<TYPE>'),
      );
    }
  });
});
