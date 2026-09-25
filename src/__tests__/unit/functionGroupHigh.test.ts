import { handleUpdateFunctionGroup } from '../../handlers/function/high/handleUpdateFunctionGroup';
import { corpusBody } from '../../lib/adtCorpus';
import {
  fakeClientOfWithFactory,
  okResponse,
  reading,
} from '../helpers/fakeClient';

/**
 * Two mutations `highTierWriteChannel.test.ts`'s shared table cannot see,
 * because it only ever checks `factory` and one field of the captured call —
 * never `options.lockHandle`, and never which patcher produced the document
 * in `options.source`.
 */

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

describe('UpdateFunctionGroup: what the shared wire-channel table does not check', () => {
  it("passes the lock handle it acquired into updateMetadata's options — dropping it is a defect the low-tier siblings (UpdatePackageLow, UpdateDataElementLow) already catch for their own families", async () => {
    const currentXml = corpusBody(
      'read-metadata-function-group--01-groups-zmcpshrfgrp',
    );
    let updateCall: { config: unknown; options: any } | undefined;
    const double = fakeClientOfWithFactory({
      lock: async () => okResponse('REAL_LOCK_HANDLE_42'),
      unlock: async () => okResponse(undefined),
      readMetadata: async () =>
        okResponse(reading(currentXml, currentXml, 200)),
      updateMetadata: async (config: unknown, options: unknown) => {
        updateCall = { config, options };
        return okResponse(reading(undefined, '', 200));
      },
    });
    fakeClient = double.client;

    const result: any = await handleUpdateFunctionGroup(context as any, {
      function_group_name: 'ZMCP_SHR_FGRP',
      description: 'after',
    });

    expect(result.isError).toBe(false);
    expect(updateCall?.options?.lockHandle).toBe('REAL_LOCK_HANDLE_42');
  });

  it("patches with its own limit (40), not a sibling family's (60) — a description in between tells the two apart", async () => {
    // functionGroupPatch truncates at 40; domain/package/dataElement's own
    // patchers truncate at 60. Swapping `patchFunctionGroupXml` for any of
    // those is invisible to a marker short enough to survive both — this
    // one (50 characters) survives only the wrong (60-limit) patcher.
    const currentXml = corpusBody(
      'read-metadata-function-group--01-groups-zmcpshrfgrp',
    );
    const description = 'x'.repeat(50);
    let patched = '';
    const double = fakeClientOfWithFactory({
      lock: async () => okResponse('h'),
      unlock: async () => okResponse(undefined),
      readMetadata: async () =>
        okResponse(reading(currentXml, currentXml, 200)),
      updateMetadata: async (_config: any, options: any) => {
        patched = options.source;
        return okResponse(reading(undefined, '', 200));
      },
    });
    fakeClient = double.client;

    await handleUpdateFunctionGroup(context as any, {
      function_group_name: 'ZMCP_SHR_FGRP',
      description,
    });

    expect(patched).toContain(`adtcore:description="${'x'.repeat(40)}"`);
    expect(patched).not.toContain(`adtcore:description="${'x'.repeat(50)}"`);
  });
});
