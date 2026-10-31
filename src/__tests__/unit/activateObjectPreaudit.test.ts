import { TOOL_DEFINITION as ActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import {
  handleActivateObject,
  TOOL_DEFINITION,
} from '../../handlers/common/low/handleActivateObject';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { recordingConnection } from '../helpers/recordingConnection';

/**
 * The single-object path takes no preaudit parameter, and every family's
 * `activate()` sends `preauditRequested=true` (adt-clients
 * `activateObjectInSession`, and the function group's and data element's own
 * request). The description says what is sent.
 */
describe("ActivateObject's preaudit, as described", () => {
  it('says what the single-object path sends', () => {
    const text = TOOL_DEFINITION.inputSchema.properties.preaudit.description;
    expect(text).toContain('preauditRequested=true');
    expect(text).not.toContain('no preaudit parameter at all');
  });

  it('ActivateObjects, which serves that handler, says the same', () => {
    const text = ActivateObjects.inputSchema.properties.preaudit.description;
    expect(text).toContain('always sends preauditRequested=true');
  });
});

/**
 * What the description says is what goes on the wire: over a recording
 * connection (real adt-clients code, no SAP), one object of a listed type —
 * its code, a name standing for it, its main type — sends
 * `preauditRequested=true` whatever `preaudit` says; a group activation sends
 * `preaudit` as given.
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
    preaudit: boolean,
  ): Promise<string[]> {
    const connection = recordingConnection();
    declareSystemKind(connection, 'onprem');
    await handleActivateObject({ connection }, { objects, preaudit }).catch(
      () => undefined,
    );
    return connection.requests
      .map((request) => request.url)
      .filter((url) => url.includes('/sap/bc/adt/activation'));
  }

  it.each(['TABL/DS', 'stru', 'structure', 'DDLS/DF', 'view', 'CLAS'])(
    'one object of %s sends preauditRequested=true with preaudit false',
    async (type) => {
      const urls = await activationUrls([{ name: 'ZA', type }], false);
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
