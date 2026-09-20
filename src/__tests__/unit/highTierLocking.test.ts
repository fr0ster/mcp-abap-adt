import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';
import { handleCreateDomain } from '../../handlers/domain/high/handleCreateDomain';
import { handleUpdateDomain } from '../../handlers/domain/high/handleUpdateDomain';
import {
  fakeClientOf,
  okResponse,
  reading,
  refusedResponse,
} from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

/** A minimal but complete domain metadata document, for the create lifecycle's
 * read-modify-write to patch without tripping over a field it cannot find. */
const DOMAIN_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" ' +
  'adtcore:description="before">' +
  '<doma:datatype>CHAR</doma:datatype>' +
  '<doma:length>10</doma:length>' +
  '<doma:decimals>0</doma:decimals>' +
  '<doma:conversionExit/>' +
  '<doma:signExists>false</doma:signExists>' +
  '<doma:lowercase>false</doma:lowercase>' +
  '<doma:valueTableRef/>' +
  '<doma:fixValues/>' +
  '</doma:domain>';

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

describe('high-tier writes that hold a lock, through withLock', () => {
  it('releases the lock when the update is refused, and answers the update failure', async () => {
    const unlock = jest.fn(async () => okResponse(undefined));
    fakeClient = fakeClientOf({
      lock: async () => okResponse('handle-1'),
      update: async () => refusedResponse('Update refused'),
      unlock,
    });
    const result: any = await handleUpdateClass(context as any, {
      class_name: 'ZCL_X',
      source_code: 'x',
    });
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe('Update refused');
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
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.result).toBe('SUCCESS');
    expect(payload.cleanup).toMatchObject({ message: 'Unlock refused' });
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
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content[0].text).cleanup).toMatchObject({
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
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toBe('Object is locked by SAPUSER01');
    expect(payload.cleanup).toMatchObject({ message: 'Unlock refused' });
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
    const check = jest.fn(async () =>
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
    const update = jest.fn(async () => okResponse(reading(undefined, '', 200)));
    const unlock = jest.fn(async () => okResponse(undefined));
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
    expect(check).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(false);
  });

  it('does not write when the pre-write check could not run', async () => {
    const check = jest.fn(async () =>
      refusedResponse('Resource not found', { origin: 'refusal' }),
    );
    const update = jest.fn(async () => okResponse(reading(undefined, '', 200)));
    const unlock = jest.fn(async () => okResponse(undefined));
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
    expect(check).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    // The lock is still released: `withLock` is not a `sequence`.
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Resource not found',
    );
  });

  it('skips the pre-write check on the default (non-activating) path', async () => {
    const check = jest.fn(async () => refusedResponse('would have refused'));
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
    expect(result.isError).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });

  it('runs the post-write check unconditionally on the default path (fix round 1)', async () => {
    const check = jest.fn(async () => refusedResponse('Refused post-write'));
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
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Refused post-write',
    );
    expect(check).toHaveBeenCalledTimes(1);
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
    expect(result.isError).toBe(false);
    // The order the handler performs today: validate, create, then the
    // read-modify-write held under one lock, then a best-effort wait (a
    // second `readMetadata`, discarded) immediately before `check` — the
    // first call after the write that reads it back, and so the one the
    // wait has to sit ahead of, not after — then activate.
    expect(order).toEqual([
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
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).message).toBe(
      'Syntax check failed',
    );
    expect(order).not.toContain('activate');
    // The lock was released before the check ran, so a refused check leaves none.
    expect(order.filter((p) => p === 'unlock')).toHaveLength(1);
  });

  it('a refused activation is answered as the strategy built it', async () => {
    const order: string[] = [];
    fakeClient = recordingLifecycle(order, {
      activate: async (_c: unknown, o: any) => {
        expect(o.analyse).toBe(analyseActivation);
        return refusedResponse('Activation failed');
      },
    });
    const result: any = await handleCreateDomain(context as any, lifecycleArgs);
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toBe('Activation failed');
    expect(payload.origin).toBe('refusal');
    // No sentence of the handler's own about which phase it was.
    expect(result.content[0].text).not.toContain('phase');
  });
});
