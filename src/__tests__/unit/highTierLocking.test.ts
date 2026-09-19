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
   * The pre-write check informs; it does not gate.
   *
   * It was a `sequence` step for a while, so a check that refused stopped the
   * update — and with the shipped `analyseCheck` on it, a syntax finding was
   * a refusal, so a caller could not save work in progress. The
   * pre-migration handler ran the check in its own `try`, warned about
   * whatever came back and wrote anyway.
   */
  it('runs the pre-write check when activating, and writes regardless of it', async () => {
    const check = jest.fn(async () =>
      refusedResponse('Syntax error in new source'),
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
