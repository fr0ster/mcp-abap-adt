import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';
import { handleCreateDomain } from '../../handlers/domain/high/handleCreateDomain';
import { handleUpdateDomain } from '../../handlers/domain/high/handleUpdateDomain';
import * as clients from '../../lib/clients';
import { corpusBody } from '../helpers/adtCorpus';
import { assertMatchObject } from '../helpers/assertions';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

mock.method(clients, 'createAdtClient', () => fakeClient);

let fakeClient: unknown;

/** A minimal but complete domain metadata document, for the create lifecycle's
 * read-modify-write to patch without tripping over a field it cannot find. */
const DOMAIN_XML = corpusBody('create-domain--01-ddic-domains');

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

describe('high-tier writes that hold a lock, through withLock', () => {
  it('releases the lock when the update is refused, and answers the update failure', async () => {
    const unlock = mock.fn(async () => okResponse(undefined));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => refusedResponse('Update refused'),
      unlock,
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
    });
    assert.equal(unlock.mock.callCount(), 1);
    assert.equal(result.isError, true);
    assert.equal(JSON.parse(result.content[0].text).message, 'Update refused');
  });

  /**
   * The write landed, so the tool says so — and says the lock is still held.
   *
   * This asserted `isError: true` for a while. A caller was told their update
   * had failed when it had not, which is the opposite of what these handlers
   * did before the migration (catch the refused unlock, warn, carry on).
   */
  it('answers the write under a refused unlock, and names the lock left behind', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => refusedResponse('Unlock refused'),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
    });
    assert.equal(result.isError, false);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.result, 'SUCCESS');
    assertMatchObject(payload.cleanup, { message: 'Unlock refused' });
  });

  /**
   * And the lock survives the activation that follows.
   *
   * `withLock` hangs the note on the write's answer, but a handler asked to
   * activate checks that answer for `ok` and then returns the activation's
   * instead — so the one call where a held lock matters most is the one that
   * dropped it. `carryCleanup` moves the note onto the answer that is really
   * returned, on both its outcomes.
   */
  it('keeps the lock note on the activation that follows the write', async () => {
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      check: async () => okResponse(reading({ ran: true, messages: [] })),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => refusedResponse('Unlock refused'),
      activate: async () => okResponse(reading(undefined, '', 200)),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
      activate: true,
    });
    assert.equal(result.isError, false);
    assertMatchObject(JSON.parse(result.content[0].text).cleanup, {
      message: 'Unlock refused',
    });
  });

  it('keeps the lock note on an activation that failed', async () => {
    // The likeliest pairing of all: the activation fails *because* of the lock
    // nobody released, and its error is the only thing the caller sees.
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      check: async () => okResponse(reading({ ran: true, messages: [] })),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => refusedResponse('Unlock refused'),
      activate: async () => refusedResponse('Object is locked by SAPUSER01'),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
      activate: true,
    });
    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.message, 'Object is locked by SAPUSER01');
    assertMatchObject(payload.cleanup, { message: 'Unlock refused' });
  });

  it('keeps the lock note when the activation throws outright', async () => {
    // Not a refusal: a broken connection, a parser defect — anything that
    // leaves the client with an exception rather than an answer. The answer
    // the caller gets is `client_threw`, and for a round it carried nothing
    // about the lock still held, because the throw unwound past the carrying.
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      check: async () => okResponse(reading({ ran: true, messages: [] })),
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => refusedResponse('Unlock refused'),
      activate: async () => {
        throw new Error('socket hang up');
      },
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
      activate: true,
    });
    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.error, 'client_threw');
    assert.equal(payload.message, 'socket hang up');
    assertMatchObject(payload.cleanup, { message: 'Unlock refused' });
  });

  /**
   * The pre-write check carries its findings past the write, and a check that
   * could not run still stops it.
   *
   * Two readings were wrong here in turn. First the shipped `analyseCheck`,
   * which makes a `chkrun:checkMessage` of type `E` a refusal — so `sequence`
   * stopped the update on a syntax finding and a caller could not save work in
   * progress. Then, fixing that, the gate came out altogether, on the strength
   * of a `logger.warn` in the pre-19 handler that in fact belonged to the
   * *post-unlock* informational check. The pre-write one threw ("New code
   * check failed: …") and the update never happened.
   *
   * With `analyseException` the step gates on exactly what it should: an
   * `exc:exception`, a non-2xx or a broken connection. The earlier version of
   * this test hid the difference by handing the check a `refusedResponse`
   * labelled "Syntax error", which under `analyseException` is not a refusal
   * at all.
   */
  it('writes past what the pre-write check found', async () => {
    // Findings arrive as a successful answer: `ran` and the messages beside
    // it, which is what `terseCheck` renders. Nothing here refuses.
    const check = mock.fn(async () =>
      okResponse(
        reading(
          {
            ran: true,
            messages: [{ type: 'E', text: 'Syntax error in line 3' }],
          },
          '<chkrun:checkRunReports/>',
          200,
        ),
      ),
    );
    const update = mock.fn(async () => okResponse(reading(undefined, '', 200)));
    const unlock = mock.fn(async () => okResponse(undefined));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      check,
      update,
      unlock,
      activate: async () => okResponse(reading(undefined, '', 200)),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'bad source',
      activate: true,
    });
    assert.equal(check.mock.callCount(), 1);
    assert.equal(update.mock.callCount(), 1);
    assert.equal(unlock.mock.callCount(), 1);
    assert.equal(result.isError, false);
  });

  it('does not write when the pre-write check could not run', async () => {
    const check = mock.fn(async () =>
      refusedResponse('Resource not found', { origin: 'refusal' }),
    );
    const update = mock.fn(async () => okResponse(reading(undefined, '', 200)));
    const unlock = mock.fn(async () => okResponse(undefined));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      check,
      update,
      unlock,
      activate: async () => okResponse(reading(undefined, '', 200)),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
      activate: true,
    });
    assert.equal(check.mock.callCount(), 1);
    assert.equal(update.mock.callCount(), 0);
    // The lock is still released: `withLock` is not a `sequence`.
    assert.equal(unlock.mock.callCount(), 1);
    assert.equal(result.isError, true);
    assert.equal(
      JSON.parse(result.content[0].text).message,
      'Resource not found',
    );
  });

  it('skips the pre-write check on the default (non-activating) path', async () => {
    const check = mock.fn(async () => refusedResponse('would have refused'));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      check,
      update: async () => okResponse(reading(undefined, '', 200)),
      unlock: async () => okResponse(undefined),
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
    });
    assert.equal(result.isError, false);
    assert.equal(check.mock.callCount(), 0);
  });

  it('runs the post-write check unconditionally on the default path (fix round 1)', async () => {
    const check = mock.fn(async () => refusedResponse('Refused post-write'));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      readMetadata: async () => okResponse(reading(DOMAIN_XML)),
      updateMetadata: async () => okResponse(reading(undefined, '', 200)),
      check,
      unlock: async () => okResponse(undefined),
    });
    // domain_name/package_name only: activate defaults to true for
    // UpdateDomain, but the check the four "unconditional" families ran was
    // never gated by activate in the first place — it is a mandatory phase
    // of the sequence, regardless of what activate is set to.
    const result: any = await handleUpdateDomain(context as any, {
      domain_name: 'ZD',
      package_name: 'ZP',
      activate: false,
    });
    assert.equal(result.isError, true);
    assert.equal(
      JSON.parse(result.content[0].text).message,
      'Refused post-write',
    );
    assert.equal(check.mock.callCount(), 1);
  });

  const lifecycleArgs = {
    domain_name: 'ZD',
    package_name: 'ZP',
    description: 'x',
    datatype: 'CHAR',
    length: 10,
  };

  /** Every phase answering, recording the order it was asked in. */
  const recordingLifecycle = (
    order: string[],
    overrides: Record<string, unknown> = {},
  ) =>
    fakeClientOf({
      validate: async () => {
        order.push('validate');
        return okResponse(reading({}));
      },
      create: async () => {
        order.push('create');
        return okResponse(reading(undefined, '', 200));
      },
      lock: async () => {
        order.push('lock');
        return okResponse('handle-1');
      },
      readMetadata: async () => {
        order.push('read');
        return okResponse(reading(DOMAIN_XML));
      },
      updateMetadata: async () => {
        order.push('update');
        return okResponse(reading(undefined, '', 200));
      },
      unlock: async () => {
        order.push('unlock');
        return okResponse(undefined);
      },
      check: async () => {
        order.push('check');
        return okResponse(reading({}));
      },
      activate: async () => {
        order.push('activate');
        return okResponse(reading({}));
      },
      ...overrides,
    });

  it('a lifecycle create runs every phase, and locks only the body write', async () => {
    const order: string[] = [];
    fakeClient = recordingLifecycle(order);
    const result: any = await handleCreateDomain(context as any, lifecycleArgs);
    assert.equal(result.isError, false);
    // The order the handler performs today: validate, create, then the
    // read-modify-write held under one lock, then a best-effort wait (a
    // second `readMetadata`, discarded) immediately before `check` — the
    // first call after the write that reads it back, and so the one the
    // wait has to sit ahead of, not after — then activate.
    assert.deepStrictEqual(order, [
      'validate',
      'create',
      'lock',
      'read',
      'update',
      'unlock',
      'read',
      'check',
      'activate',
    ]);
  });

  it('a refused check stops the lifecycle before activation', async () => {
    const order: string[] = [];
    fakeClient = recordingLifecycle(order, {
      check: async () => {
        order.push('check');
        return refusedResponse('Syntax check failed');
      },
    });
    const result: any = await handleCreateDomain(context as any, lifecycleArgs);
    assert.equal(result.isError, true);
    assert.equal(
      JSON.parse(result.content[0].text).message,
      'Syntax check failed',
    );
    assert.ok(!order.includes('activate'));
    // The lock was released before the check ran, so a refused check leaves none.
    assert.equal(order.filter((p) => p === 'unlock').length, 1);
  });

  it('a refused activation is answered as the strategy built it', async () => {
    const order: string[] = [];
    fakeClient = recordingLifecycle(order, {
      activate: async (_c: unknown, o: any) => {
        assert.equal(o.analyse, analyseActivation);
        return refusedResponse('Activation failed');
      },
    });
    const result: any = await handleCreateDomain(context as any, lifecycleArgs);
    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.message, 'Activation failed');
    assert.equal(payload.origin, 'refusal');
    // No sentence of the handler's own about which phase it was.
    assert.ok(!result.content[0].text.includes('phase'));
  });
});
