import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { defineTool } from '@mcp-abap-adt/lib/handlers';
import { assertRejects } from '../../../src/__tests__/helpers/assertions';
import { recordingConnection } from '../../../src/__tests__/helpers/recordingConnection';
import * as activateObject from '../../../src/handlers/common/low/handleActivateObject';
import { declareSystemKind } from '../../../src/lib/systemKind';
import {
  handleHandlerActivate,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerActivate';

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
// The activate route arrives through lib's write barrel, whose getters read
// the module that defines both names: they are replaced there (HandlerActivate
// reads them at call time); every
// other name stays real.
mock.method(
  activateObject,
  'handleActivateObjectOnce',
  (_context: unknown, args: unknown) => {
    sent = args;
    return Promise.resolve({ content: [{ type: 'text', text: '{}' }] });
  },
);
// object_type is checked at HandlerActivate's boundary and handed on as
// a decided activation.
mock.method(
  activateObject,
  'activatePlanOnce',
  (_context: unknown, plan: unknown) => {
    planned = plan;
    return Promise.resolve({ content: [{ type: 'text', text: '{}' }] });
  },
);

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

    assert.deepStrictEqual(planned, {
      single: { api: 'class', name: 'ZCL_X' },
    });
  });

  it('activates any other type in a group activation, by its code', async () => {
    await handleHandlerActivate(context, {
      object_name: 'ZMCP_PKG',
      object_type: 'PACKAGE',
    });

    // `DEVC/K`, the code `COMPACT_ACTIVATE_ROUTES` gives it.
    // The group is typed by the declared variant.
    assert.deepStrictEqual(planned, {
      group: {
        variant: 'onprem',
        references: [{ name: 'ZMCP_PKG', type: 'DEVC/K' }],
      },
    });
  });

  for (const [object_type, object_name, type] of [
    ['INCLUDE', 'ZINCL_X', 'PROG/I'],
    ['TABLE_TYPE', 'ZTTYP_X', 'TTYP/DA'],
  ] as const) {
    it(
      format(
        'activates %s alone in a group activation, by its code',
        object_type,
      ),
      async () => {
        await handleHandlerActivate(context, { object_name, object_type });

        assert.deepStrictEqual(planned, {
          group: {
            variant: 'onprem',
            references: [{ name: object_name, type }],
          },
        });
      },
    );
  }

  it('activates a table type on ABAP cloud, and refuses an include there', async () => {
    declareSystemKind(connection, 'cloud');
    try {
      await handleHandlerActivate(context, {
        object_name: 'ZTTYP_X',
        object_type: 'TABLE_TYPE',
      });
      assert.deepStrictEqual(planned, {
        group: {
          variant: 'cloud',
          references: [{ name: 'ZTTYP_X', type: 'TTYP/DA' }],
        },
      });
      planned = undefined;
      await assertRejects(
        handleHandlerActivate(context, {
          object_name: 'ZINCL_X',
          object_type: 'INCLUDE',
        }),
        'object_adt_type',
      );
      assert.equal(planned, undefined);
    } finally {
      declareSystemKind(connection, 'onprem');
    }
  });

  it('prefers the explicit ADT type when the caller gives one', async () => {
    await handleHandlerActivate(context, {
      object_name: 'ZCL_X',
      object_type: 'CLASS',
      object_adt_type: 'CLAS/OC',
    });

    assert.equal(typeSent(), 'CLAS/OC');
  });

  /**
   * **The case this file exists for.** `UNIT_TEST` has no friendly name in
   * the map and no measured ADT code here. Lowercased and handed on it would
   * have reached the server as `unit_test`. The model's call names it
   * through the tool's schema, which refuses it before the handler runs.
   */
  it('refuses a type it cannot translate, rather than inventing one', async () => {
    sent = undefined;
    const entry = defineTool(TOOL_DEFINITION, handleHandlerActivate);

    const refused = assertRejects(
      entry.call(context, { object_name: 'ZCL_X', object_type: 'UNIT_TEST' }),
      'Invalid arguments for tool HandlerActivate: Invalid option',
    );
    await refused;

    // And nothing was sent: the refusal is here, not at SAP.
    assert.equal(sent, undefined);
  });

  it('names the field that settles it, and what it knows without it', async () => {
    const entry = defineTool(TOOL_DEFINITION, handleHandlerActivate);
    // TRANSPORT is no member of the schema: refused at the boundary.
    const outside = assertRejects(
      entry.call(context, { object_name: 'ZCL_X', object_type: 'TRANSPORT' }),
      'Invalid arguments for tool HandlerActivate',
    );
    await outside;
    // A member the cloud variant does not list is refused by the cloud
    // schema, the call's own variant's, naming what it lists.
    declareSystemKind(connection, 'cloud');
    try {
      const unnamed = assertRejects(
        entry.call(context, { object_name: 'ZCL_X', object_type: 'PROGRAM' }),
        /Invalid arguments for tool HandlerActivate: .*"CLASS"\|"INTERFACE".* at object_type/,
      );
      await unnamed;
    } finally {
      declareSystemKind(connection, 'onprem');
    }
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

    assert.ok(
      JSON.stringify(answered).includes(
        'FUNCTION_MODULE is named GROUP|MODULE in object_name, or with function_group_name',
      ),
    );
    assert.equal(sent, undefined);
    assert.equal(planned, undefined);
  });

  it('activates a function module under its group: GROUP|MODULE or function_group_name', async () => {
    await handleHandlerActivate(context, {
      object_name: 'zac_fgr01|z_ac_fm01',
      object_type: 'FUNCTION_MODULE',
    });
    assert.deepStrictEqual(planned, {
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
    assert.deepStrictEqual(planned, {
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

    assert.deepStrictEqual(planned, {
      single: { api: 'class', name: 'ZBP_X' },
    });
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

    assert.equal(typeSent(), 'FUGR/FF');
    assert.equal(nameSent(), 'Z_AC_FM01');
    assert.equal(parentSent(), 'ZAC_FGR01');
  });

  it('still takes objects[] untouched', async () => {
    await handleHandlerActivate(context, {
      objects: [{ name: 'ZCL_X', type: 'CLAS/OC' }],
    });

    assert.equal(typeSent(), 'CLAS/OC');
  });
});
