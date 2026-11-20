/**
 * One object named by a friendly name is activated exactly as one object of
 * its code (#329, S6): the boundary of `objects[].type` reads a name of
 * `TYPE_NAMES` as its code once, and `SINGLE_ACTIVATION_ROUTES` routes the
 * code. So `stru` reaches the structure family's own activation as `TABL/DS`
 * does, `view` the DDL's as `DDLS/DF` does, and a name whose code takes group
 * activation (`functionmodule`) takes it as its code does.
 *
 * Each case runs the tool's own handler over a recording connection declared
 * the variant — real adt-clients code, no SAP — and compares the requests.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { handleHandlerActivate } from '../../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import { handleActivateObject } from '../../../handlers/common/low/handleActivateObject';
import {
  ACTIVATION_NAMES,
  type ProjectionVariant,
  SINGLE_ACTIVATION,
  SINGLE_ACTIVATION_NAMES,
  TYPE_NAMES,
} from '../../../lib/adtProjections';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { resetSystemContextCache } from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { setSystemContext } from '../../helpers/processSystemContext';
import {
  type RecordedRequest,
  recordingConnection,
} from '../../helpers/recordingConnection';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

/** One way a single object reaches the activation boundary. */
interface Route {
  readonly tool: string;
  readonly send: (context: HandlerContext, type: string) => Promise<unknown>;
  /**
   * Whether the route names a function module's group. Without it a module
   * is addressed by nothing, by its name as by its code; HandlerActivate's
   * own form for one is object_type FUNCTION_MODULE.
   */
  readonly groupNamed: boolean;
}

/**
 * Every tool whose one object goes through the boundary of `objects[].type`.
 * The group is named for every type: a function module's address is built
 * from it, and any other type's activation reads no group.
 */
const ROUTES: readonly Route[] = [
  {
    tool: 'ActivateObjects',
    send: (context, type) =>
      handleActivateObjects(context, {
        objects: [{ name: 'ZA', type, parentName: 'ZFG_A' }],
      }),
    groupNamed: true,
  },
  {
    tool: 'ActivateObjectLow',
    send: (context, type) =>
      handleActivateObject(context, {
        objects: [{ name: 'ZA', type, parentName: 'ZFG_A' }],
      }),
    groupNamed: true,
  },
  {
    tool: 'HandlerActivate objects[]',
    send: (context, type) =>
      handleHandlerActivate(context, {
        objects: [{ name: 'ZA', type, parentName: 'ZFG_A' }],
      }),
    groupNamed: true,
  },
  {
    tool: 'HandlerActivate object_adt_type',
    send: (context, type) =>
      handleHandlerActivate(context, {
        object_name: 'ZA',
        object_adt_type: type,
      }),
    groupNamed: false,
  },
];

/**
 * The requests `send` issues with `type` on `variant`, as text with each
 * batch's random boundary replaced by one fixed name.
 */
async function requestsOf(
  route: Route,
  variant: ProjectionVariant,
  type: string,
): Promise<string[]> {
  process.env.SAP_SYSTEM_TYPE = variant;
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  await route.send({ connection }, type).catch(() => undefined);
  return connection.requests.map((request: RecordedRequest) =>
    JSON.stringify(request).replaceAll(/batch_[0-9a-f-]+/g, 'batch_X'),
  );
}

/** Whether `requests` hold a group activation run. */
const grouped = (requests: readonly string[]) =>
  requests.some((request) => request.includes('/sap/bc/adt/activation/runs'));

describe('one object of a friendly name is activated exactly as one object of its code', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });

  afterEach(() => {
    resetSystemContextCache();
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  /** The names standing for a single-activation code, per variant. */
  it('names exactly the names whose code is a single-activation code', () => {
    assert.deepStrictEqual(SINGLE_ACTIVATION_NAMES, {
      onprem: [
        'class',
        'program',
        'functiongroup',
        'interface',
        'table',
        'structure',
        'domain',
        'dataelement',
        'view',
        'stru',
      ],
      cloud: [
        'class',
        'functiongroup',
        'interface',
        'table',
        'structure',
        'domain',
        'dataelement',
        'view',
        'stru',
      ],
    });
    for (const variant of VARIANTS) {
      const single = new Set<string>(SINGLE_ACTIVATION[variant]);
      assert.deepStrictEqual(
        ACTIVATION_NAMES[variant].filter((name) =>
          single.has(TYPE_NAMES[name]),
        ),
        SINGLE_ACTIVATION_NAMES[variant],
      );
    }
  });

  const cases = VARIANTS.flatMap((variant) =>
    ROUTES.flatMap((route) =>
      ACTIVATION_NAMES[variant]
        .filter((name) => route.groupNamed || TYPE_NAMES[name] !== 'FUGR/FF')
        .map(
          (name) =>
            [route.tool, variant, name, TYPE_NAMES[name], route] as const,
        ),
    ),
  );

  for (const [_tool, variant, name, code, route] of cases) {
    it(
      format(
        '%s on %s: %s sends exactly what %s sends, in either case',
        _tool,
        variant,
        name,
        code,
      ),
      async () => {
        const byCode = await requestsOf(route, variant, code);
        const byName = await requestsOf(route, variant, name);
        const capitalised = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
        const byMixed = await requestsOf(route, variant, capitalised);
        assert.ok(byCode.length > 0);
        assert.deepStrictEqual(byName, byCode);
        assert.deepStrictEqual(byMixed, byCode);
        // In upper case a name is read as itself only where it is no other
        // word of the tables: `VIEW` is the dictionary view's search name
        // (`VIEW/DV`; caseRule.test.ts), `STRU` and `FUNC` list the code
        // their names stand for.
        if (name !== 'view') {
          const byUpper = await requestsOf(route, variant, name.toUpperCase());
          assert.deepStrictEqual(byUpper, byCode);
        }
      },
    );
  }

  const singleCases = VARIANTS.flatMap((variant) =>
    ROUTES.flatMap((route) =>
      SINGLE_ACTIVATION_NAMES[variant].map(
        (name) => [route.tool, variant, name, route] as const,
      ),
    ),
  );

  for (const [_tool, variant, name, route] of singleCases) {
    it(
      format(
        "%s on %s: %s is activated through its family's own activation, no group run",
        _tool,
        variant,
        name,
      ),
      async () => {
        const byName = await requestsOf(route, variant, name);
        assert.ok(byName.length > 0);
        assert.equal(grouped(byName), false);
      },
    );
  }
});
