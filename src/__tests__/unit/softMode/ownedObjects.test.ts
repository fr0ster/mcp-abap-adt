/**
 * Creates and deletes whose answer may be lost (#394, spec §5): an object is
 * `unconfirmed` before its create is sent and stays so unless SAP refused
 * it; a delete marks it `delete-sent` before it is sent and is never sent
 * again; a `404` to the delete of an `unconfirmed` object counts as removed.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ToolResultLike } from '../../../lib/toolResult';
import {
  OwnedObjects,
  ownedObjectsIfAny,
  ownedObjectsOf,
} from '../../integration/helpers/ownedObjects';

const json = (payload: unknown, isError: boolean): ToolResultLike => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(payload) }],
});
const ok = async () => json({ result: 'ok' }, false);
const cut = async () =>
  json(
    { message: 'x', origin: 'connection', connection_cause: 'ECONNRESET' },
    true,
  );
const refused = async () =>
  json({ message: 'exists', origin: 'refusal', status: 400 }, true);
const notFound = async () =>
  json({ message: 'gone', origin: 'refusal', status: 404 }, true);

describe('OwnedObjects', () => {
  it('is unconfirmed while its create is in flight', async () => {
    const owned = new OwnedObjects();
    let seen: string | undefined;
    await owned.create('class', 'ZCL_A', async () => {
      seen = owned.stillOwned[0]?.state;
      return json({ result: 'ok' }, false);
    });
    assert.equal(seen, 'unconfirmed');
    assert.equal(owned.stillOwned[0]?.state, 'exists');
  });

  it('a create lost to the network stays unconfirmed; a refused one is dropped', async () => {
    const owned = new OwnedObjects();
    await owned.create('class', 'ZCL_LOST', cut);
    await owned.create('class', 'ZCL_NO', refused);
    await owned.create('class', 'ZCL_THREW', async () => {
      throw Object.assign(new Error('x'), { code: 'ETIMEDOUT' });
    });
    assert.deepEqual(
      owned.stillOwned.map((entry) => [entry.name, entry.state]),
      [
        ['ZCL_LOST', 'unconfirmed'],
        ['ZCL_THREW', 'unconfirmed'],
      ],
    );
  });

  it('cleanup deletes an unconfirmed object, and its 404 counts as removed', async () => {
    const owned = new OwnedObjects();
    await owned.create('class', 'ZCL_LOST', cut);
    const sent = await owned.delete('ZCL_LOST', notFound);
    assert.notEqual(sent, undefined);
    assert.equal(owned.stillOwned.length, 0);
  });

  it('a 404 to the delete of an object that existed is not taken as removed', async () => {
    const owned = new OwnedObjects();
    await owned.create('class', 'ZCL_A', ok);
    await owned.delete('ZCL_A', notFound);
    assert.equal(owned.stillOwned[0]?.state, 'delete-sent');
  });

  it('a delete is marked before it is sent, and never sent again', async () => {
    const owned = new OwnedObjects();
    await owned.create('class', 'ZCL_A', ok);
    let seen: string | undefined;
    let sent = 0;
    const first = await owned.delete('ZCL_A', async () => {
      sent += 1;
      seen = owned.stillOwned[0]?.state;
      return cut();
    });
    const second = await owned.delete('ZCL_A', async () => {
      sent += 1;
      return ok();
    });
    assert.equal(seen, 'delete-sent');
    assert.equal(first?.outcome, 'network');
    assert.equal(second, undefined);
    assert.equal(sent, 1);
    assert.equal(owned.stillOwned[0]?.state, 'delete-sent');
  });

  it('an ok delete removes it; newestFirst lists one kind', async () => {
    const owned = new OwnedObjects();
    await owned.create('class', 'ZCL_A', ok);
    await owned.create('class', 'ZCL_B', ok);
    owned.exists('package', 'ZPKG');
    assert.deepEqual(owned.newestFirst('class'), ['ZCL_B', 'ZCL_A']);
    await owned.delete('ZCL_B', ok);
    assert.deepEqual(owned.newestFirst('class'), ['ZCL_A']);
  });

  it('one record per connection', () => {
    const run = {};
    ownedObjectsOf(run).exists('class', 'ZCL_A');
    assert.equal(ownedObjectsIfAny({}), undefined);
    assert.equal(ownedObjectsOf(run).stillOwned.length, 1);
  });
});
