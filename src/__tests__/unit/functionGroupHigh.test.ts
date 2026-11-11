import { handleUpdateFunctionGroup } from '../../handlers/function/high/handleUpdateFunctionGroup';
import { corpusBody } from '../helpers/adtCorpus';
import {
  fakeClientOfWithFactory,
  okResponse,
  reading,
} from '../helpers/fakeClient';

/**
 * A mutation `highTierWriteChannel.test.ts`'s shared table cannot see,
 * because it only ever checks `factory` and one field of the captured call —
 * never `options.lockHandle`. The description as given, and the patch's
 * refusal, are `documentPatchHandlers.test.ts`'s.
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
});
