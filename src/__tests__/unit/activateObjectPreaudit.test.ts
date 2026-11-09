import { TOOL_DEFINITION as ActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import {
  handleActivateObject,
  TOOL_DEFINITION,
} from '../../handlers/common/low/handleActivateObject';
import { SINGLE_ACTIVATION } from '../../lib/adtProjections';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { jsonAt, listedJson } from '../helpers/listedJson';
import { recordingConnection } from '../helpers/recordingConnection';

/**
 * `preaudit` is sent as `preauditRequested` on both paths — the single
 * object's own activation (adt-clients 45, `options.preauditRequested`) and
 * the group activation — default true (fr0ster/mcp-abap-adt#351). The
 * description says so.
 */
describe("ActivateObject's preaudit, as described", () => {
  it.each([
    ['ActivateObjectLow', TOOL_DEFINITION.inputSchema],
    ['ActivateObjects', ActivateObjects.inputSchema],
  ])('%s says it is sent on both paths, default true', (_tool, schema) => {
    const text = jsonAt(listedJson(schema), 'preaudit').description;
    expect(text).toContain('Default: true');
    expect(text).toContain('single-object activation and group activation');
    expect(text).not.toContain('always sends preauditRequested=true');
  });
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

  it.each(SINGLE)(
    'one object of %s sends preauditRequested=false with preaudit false',
    async (type) => {
      const urls = await activationUrls([{ name: 'ZA', type }], false);
      expect(urls).toEqual([
        '/sap/bc/adt/activation?method=activate&preauditRequested=false',
      ]);
    },
  );

  it.each(SINGLE)(
    'one object of %s sends preauditRequested=true without preaudit',
    async (type) => {
      const urls = await activationUrls([{ name: 'ZA', type }], undefined);
      expect(urls).toEqual([
        '/sap/bc/adt/activation?method=activate&preauditRequested=true',
      ]);
    },
  );

  it.each([true, false])(
    'a group activation sends preauditRequested=%s as given',
    async (preaudit) => {
      const urls = await activationUrls(
        [
          { name: 'ZA', type: 'TABL/DS' },
          { name: 'ZB', type: 'TABL/DS' },
        ],
        preaudit,
      );
      expect(urls[0]).toBe(
        `/sap/bc/adt/activation/runs?method=activate&preauditRequested=${preaudit}`,
      );
    },
  );
});
