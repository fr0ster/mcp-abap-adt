/**
 * One run connection per file in soft mode (#394, review): every
 * `liveSuite` of a file takes the same connection, opened and logged on
 * once; the file's close logs it off (it is tracked). A failed open is not
 * kept, so the next suite opens again.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileRunConnection } from '../../integration/helpers/live';
import type { GuardedConnection } from '../../integration/helpers/refusalGuard';

/** A stand-in for a connection: only its identity is compared. */
const made = (id: number): GuardedConnection =>
  ({ id }) as unknown as GuardedConnection;

describe('fileRunConnection', () => {
  it('opens once per file and kind, and every suite gets the same connection', async () => {
    let opened = 0;
    const open = async () => {
      opened += 1;
      return made(opened);
    };
    const first = await fileRunConnection('onprem', open);
    const second = await fileRunConnection('onprem', open);
    assert.equal(first, second);
    assert.equal(opened, 1);
  });

  it('a failed open is not kept', async () => {
    let attempts = 0;
    const open = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('logon failed');
      return made(attempts);
    };
    await assert.rejects(fileRunConnection('cloud', open));
    const connection = await fileRunConnection('cloud', open);
    assert.deepEqual(connection, made(2));
  });
});
