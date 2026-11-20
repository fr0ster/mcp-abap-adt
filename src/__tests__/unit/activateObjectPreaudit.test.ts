import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format } from 'node:util';
import { TOOL_DEFINITION as ActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import {
  handleActivateObject,
  TOOL_DEFINITION,
} from '../../handlers/common/low/handleActivateObject';
import { SINGLE_ACTIVATION } from '../../lib/adtProjections';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { jsonAt, listedJson } from '../helpers/listedJson';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';

/**
 * `preaudit` is sent as `preauditRequested` on both paths — the single
 * object's own activation (adt-clients 45, `options.preauditRequested`) and
 * the group activation — default true (fr0ster/mcp-abap-adt#351). The
 * description says so.
 */
describe("ActivateObject's preaudit, as described", () => {
  for (const [_tool, schema] of [
    ['ActivateObjectLow', TOOL_DEFINITION.inputSchema],
    ['ActivateObjects', ActivateObjects.inputSchema],
  ] as const) {
    it(format('%s says it is sent on both paths, default true', _tool), () => {
      const text = jsonAt(listedJson(schema), 'preaudit').description;
      assert.ok(text !== undefined);
      assert.ok(text.includes('Default: true'));
      assert.ok(text.includes('single-object activation and group activation'));
      assert.ok(!text.includes('always sends preauditRequested=true'));
    });
  }
});

/**
 * What the description says is what goes on the wire: over a recording
 * connection (real adt-clients code, no SAP), one object of every code and
 * kind a single-object activation takes — and a name and a main type standing
 * for one — sends `preaudit` as given, and `true` when it is not given.
 */
describe('ActivateObject: preaudit on the wire', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
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

  /** The activation URLs one call with `objects` and `preaudit` sends. */
  async function activationUrls(
    objects: { name: string; type: string }[],
    preaudit: boolean | undefined,
  ): Promise<string[]> {
    const connection = recordingConnection();
    declareSystemKind(connection, 'onprem');
    await handleActivateObject(
      { connection },
      preaudit === undefined ? { objects } : { objects, preaudit },
    ).catch(() => undefined);
    return connection.requests
      .map((request) => request.url)
      .filter((url) => url.includes('/sap/bc/adt/activation'));
  }

  const SINGLE = [
    ...SINGLE_ACTIVATION.onprem,
    'stru',
    'structure',
    'view',
    'CLAS',
  ];

  for (const type of SINGLE) {
    it(
      format(
        'one object of %s sends preauditRequested=false with preaudit false',
        type,
      ),
      async () => {
        const urls = await activationUrls([{ name: 'ZA', type }], false);
        assert.deepStrictEqual(urls, [
          '/sap/bc/adt/activation?method=activate&preauditRequested=false',
        ]);
      },
    );
  }

  for (const type of SINGLE) {
    it(
      format(
        'one object of %s sends preauditRequested=true without preaudit',
        type,
      ),
      async () => {
        const urls = await activationUrls([{ name: 'ZA', type }], undefined);
        assert.deepStrictEqual(urls, [
          '/sap/bc/adt/activation?method=activate&preauditRequested=true',
        ]);
      },
    );
  }

  for (const preaudit of [true, false]) {
    it(
      format(
        'a group activation sends preauditRequested=%s as given',
        preaudit,
      ),
      async () => {
        const urls = await activationUrls(
          [
            { name: 'ZA', type: 'TABL/DS' },
            { name: 'ZB', type: 'TABL/DS' },
          ],
          preaudit,
        );
        assert.equal(
          urls[0],
          `/sap/bc/adt/activation/runs?method=activate&preauditRequested=${preaudit}`,
        );
      },
    );
  }
});
