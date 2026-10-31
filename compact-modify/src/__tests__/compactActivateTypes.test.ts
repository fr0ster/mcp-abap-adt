import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { recordingConnection } from '../../../src/__tests__/helpers/recordingConnection';
import { declareSystemKind } from '../../../src/lib/systemKind';
import { handleHandlerActivate } from '../handlers/handleHandlerActivate';

/**
 * What `HandlerActivate` does with an `object_type` it cannot translate.
 *
 * The tool takes `object_type` like every other `Handler*` tool, which is the
 * convenience it was changed for. But the schema admits 25 object types and
 * `handleActivateObject`'s map knows eleven friendly names — so lowercasing
 * whatever arrived and handing it on sent `package` where an ADT type code
 * belongs, and SAP got a malformed request instead of this tool getting a
 * refused argument. That is worse than the inconvenience it replaced: before,
 * a caller had to pass `object_adt_type`, and therefore passed something that
 * worked.
 *
 * These pin the outcomes: a type its own API activates directly, a type
 * activated in a group by the code `COMPACT_ACTIVATE_ROUTES` gives it, and
 * everything else — refused here, naming the field that settles it.
 */

let sent: unknown;
let planned: unknown;
// The activate route arrives through lib's write barrel now, so that is the module
// to intercept: this package imports the handler by package name, not by path.
jest.mock('@mcp-abap-adt/lib/handlers/write', () => {
  const actual = jest.requireActual('@mcp-abap-adt/lib/handlers/write');
  return {
    ...actual,
    handleActivateObjectOnce: (_context: unknown, args: unknown) => {
      sent = args;
      return Promise.resolve({ content: [{ type: 'text', text: '{}' }] });
    },
    // object_type is checked at HandlerActivate's boundary and handed on as
    // a decided activation.
    activatePlanOnce: (_context: unknown, plan: unknown) => {
      planned = plan;
      return Promise.resolve({ content: [{ type: 'text', text: '{}' }] });
    },
  };
});

// The refusal lists what the declared variant activates from object_type
// alone (`COMPACT_ACTIVATE`), so the connection states its variant.
const connection = recordingConnection();
declareSystemKind(connection, 'onprem');
const context: HandlerContext = { connection };
const typeSent = () =>
  (sent as { objects: { type: string }[] }).objects[0].type;
const nameSent = () =>
  (sent as { objects: { name: string }[] }).objects[0].name;
const parentSent = () =>
  (sent as { objects: { parentName?: string }[] }).objects[0].parentName;

describe('HandlerActivate and the type it was given', () => {
  it('activates a type its own API activates directly, by that API', async () => {
    await handleHandlerActivate(context, {
      object_name: 'ZCL_X',
      object_type: 'CLASS',
    });

    expect(planned).toEqual({ single: { api: 'class', name: 'ZCL_X' } });
  });

  it('activates any other type in a group activation, by its code', async () => {
    await handleHandlerActivate(context, {
      object_name: 'ZMCP_PKG',
      object_type: 'PACKAGE',
    });

    // `DEVC/K`, the code `COMPACT_ACTIVATE_ROUTES` gives it.
    // The group is typed by the declared variant.
    expect(planned).toEqual({
      group: {
        variant: 'onprem',
        references: [{ name: 'ZMCP_PKG', type: 'DEVC/K' }],
      },
    });
  });

  it('prefers the explicit ADT type when the caller gives one', async () => {
    await handleHandlerActivate(context, {
      object_name: 'ZCL_X',
      object_type: 'CLASS',
      object_adt_type: 'CLAS/OC',
    });

    expect(typeSent()).toBe('CLAS/OC');
  });

  /**
   * **The case this file exists for.** `UNIT_TEST` is in the schema, has no
   * friendly name in the map and no measured ADT code here. Lowercased and
   * handed on it would have reached the server as `unit_test`.
   */
  it('refuses a type it cannot translate, rather than inventing one', async () => {
    sent = undefined;

    await expect(
      handleHandlerActivate(context, {
        object_name: 'ZCL_X',
        object_type: 'UNIT_TEST',
      }),
    ).rejects.toThrow(/cannot turn object_type "UNIT_TEST"/);

    // And nothing was sent: the refusal is here, not at SAP.
    expect(sent).toBeUndefined();
  });

  it('names the field that settles it, and what it knows without it', async () => {
    await expect(
      handleHandlerActivate(context, {
        object_name: 'ZCL_X',
        object_type: 'TRANSPORT',
      }),
    ).rejects.toThrow(/object_adt_type/);
    // The types it names are what the variant's projection offers.
    await expect(
      handleHandlerActivate(context, {
        object_name: 'ZCL_X',
        object_type: 'TRANSPORT',
      }),
    ).rejects.toThrow(/Known without it: CLASS, PROGRAM, INTERFACE/);
    declareSystemKind(connection, 'cloud');
    await expect(
      handleHandlerActivate(context, {
        object_name: 'ZCL_X',
        object_type: 'TRANSPORT',
      }),
    ).rejects.toThrow(/Known without it: CLASS, INTERFACE/);
    declareSystemKind(connection, 'onprem');

    await expect(
      handleHandlerActivate(context, {
        object_name: 'ZCL_X',
        object_type: 'TRANSPORT',
      }),
    ).rejects.toThrow(/PACKAGE/);
  });

  /**
   * **A right type code is not a right address.** A function module's ADT
   * address is built under its function GROUP: given only the module's name,
   * a group activation would address a group by that name, a confident
   * request for an object that does not exist. So the group is required —
   * as `GROUP|MODULE` or `function_group_name` — and without it the call is
   * refused before anything is sent.
   */
  it('refuses a function module from a name alone, naming what settles it', async () => {
    sent = undefined;
    planned = undefined;

    const answered = await handleHandlerActivate(context, {
      object_name: 'Z_AC_FM01',
      object_type: 'FUNCTION_MODULE',
    });

    expect(JSON.stringify(answered)).toContain(
      'FUNCTION_MODULE is named GROUP|MODULE in object_name, or with function_group_name',
    );
    expect(sent).toBeUndefined();
    expect(planned).toBeUndefined();
  });

  it('activates a function module under its group: GROUP|MODULE or function_group_name', async () => {
    await handleHandlerActivate(context, {
      object_name: 'zac_fgr01|z_ac_fm01',
      object_type: 'FUNCTION_MODULE',
    });
    expect(planned).toEqual({
      group: {
        variant: 'onprem',
        references: [
          { name: 'Z_AC_FM01', parentName: 'ZAC_FGR01', type: 'FUGR/FF' },
        ],
      },
    });

    await handleHandlerActivate(context, {
      object_name: 'Z_AC_FM01',
      function_group_name: 'ZAC_FGR01',
      object_type: 'FUNCTION_MODULE',
    });
    expect(planned).toEqual({
      group: {
        variant: 'onprem',
        references: [
          { name: 'Z_AC_FM01', parentName: 'ZAC_FGR01', type: 'FUGR/FF' },
        ],
      },
    });
  });

  it('activates a behaviour implementation as its class', async () => {
    await handleHandlerActivate(context, {
      object_name: 'ZBP_X',
      object_type: 'BEHAVIOR_IMPLEMENTATION',
    });

    expect(planned).toEqual({ single: { api: 'class', name: 'ZBP_X' } });
  });

  /**
   * The route the refusal recommends. What makes it the right one is asserted
   * in `activationUriIsBuiltFromTheParent.test.ts`, against the builder the
   * activation path actually calls — this case only checks that the fields
   * travel.
   */
  it('activates a function module through objects[], with its group', async () => {
    await handleHandlerActivate(context, {
      objects: [
        { name: 'Z_AC_FM01', type: 'FUGR/FF', parentName: 'ZAC_FGR01' },
      ],
    });

    expect(typeSent()).toBe('FUGR/FF');
    expect(nameSent()).toBe('Z_AC_FM01');
    expect(parentSent()).toBe('ZAC_FGR01');
  });

  it('still takes objects[] untouched', async () => {
    await handleHandlerActivate(context, {
      objects: [{ name: 'ZCL_X', type: 'CLAS/OC' }],
    });

    expect(typeSent()).toBe('CLAS/OC');
  });
});
