let toClient: unknown;

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getUtils: () => ({
      activateObjectsGroup: (objects: unknown) => {
        toClient = objects;
        return Promise.resolve({
          ok: true,
          getResult: () => ({ value: 'RUN42' }),
        });
      },
    }),
  }),
}));

import { handleActivateObject } from '../../handlers/common/low/handleActivateObject';

/**
 * What reaches the client when a caller gives an address.
 *
 * `ActivateObjectLow`'s schema has advertised `objects[].uri` — "Optional ADT
 * URI" — since the handler existed, and the mapping to the client kept only
 * `type` and `name`. So the field was accepted and discarded: a caller who
 * supplied one was answered as though they had not, one layer below anything
 * that asserted.
 *
 * **What carrying it does not do is fix addressing**, and that is worth
 * stating where the tests are: `activateObjectsGroup` builds its reference
 * with `buildObjectUri(name, type, parentName)` and never reads `uri`; for
 * `fugr/ff` that builder ignores `parentName` too, requiring the group inside
 * the name — `GROUP|MODULE`. So a function module is activated by naming it
 * that way. These cases pin the passthrough, not a cure.
 */
const context = { connection: {}, logger: undefined } as never;

describe('ActivateObjectLow and the address it was given', () => {
  beforeEach(() => {
    toClient = undefined;
  });

  it('carries a uri through to the client', async () => {
    await handleActivateObject(context, {
      objects: [
        {
          name: 'Z_AC_FM01',
          type: 'FUGR/FF',
          uri: '/sap/bc/adt/functions/groups/zac_fgr01/fmodules/z_ac_fm01',
        },
      ],
    } as never);

    expect(toClient).toEqual([
      {
        name: 'Z_AC_FM01',
        type: 'FUGR/FF',
        uri: '/sap/bc/adt/functions/groups/zac_fgr01/fmodules/z_ac_fm01',
      },
    ]);
  });

  /** `parentName` travels for the same reason and by the same contract. */
  it('carries a parentName through to the client', async () => {
    await handleActivateObject(context, {
      objects: [
        { name: 'Z_AC_FM01', type: 'FUGR/FF', parentName: 'ZAC_FGR01' },
      ],
    } as never);

    expect(toClient).toEqual([
      { name: 'Z_AC_FM01', type: 'FUGR/FF', parentName: 'ZAC_FGR01' },
    ]);
  });

  /**
   * And nothing is invented for the objects that never needed one — which is
   * every case that worked before this.
   */
  it('sends no uri where the caller gave none', async () => {
    await handleActivateObject(context, {
      objects: [
        { name: 'ZCL_A', type: 'CLAS/OC' },
        { name: 'ZCL_B', type: 'CLAS/OC' },
      ],
    } as never);

    expect(toClient).toEqual([
      { name: 'ZCL_A', type: 'CLAS/OC' },
      { name: 'ZCL_B', type: 'CLAS/OC' },
    ]);
  });

  /** The name still goes up, as it always did. */
  it('upper-cases the name on the way', async () => {
    await handleActivateObject(context, {
      objects: [
        { name: 'z_ac_fm01', type: 'FUGR/FF', uri: '/sap/bc/adt/x' },
        { name: 'zcl_b', type: 'CLAS/OC' },
      ],
    } as never);

    expect((toClient as { name: string }[]).map((o) => o.name)).toEqual([
      'Z_AC_FM01',
      'ZCL_B',
    ]);
  });
});
