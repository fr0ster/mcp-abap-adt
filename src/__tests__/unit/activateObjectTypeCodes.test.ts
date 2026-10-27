let groupObjects: unknown;
const familyCalls: string[] = [];

const activates = (family: string) => () => ({
  activate: (config: unknown) => {
    familyCalls.push(`${family}:${JSON.stringify(config)}`);
    return Promise.resolve({
      ok: true,
      getResult: () => ({ value: { messages: [] }, raw: '', status: 200 }),
    });
  },
});

jest.mock('../../lib/clients', () => ({
  createAdtClient: () => ({
    getStructure: activates('structure'),
    getTable: activates('table'),
    getUtils: () => ({
      activateObjectsGroup: (objects: unknown) => {
        groupObjects = objects;
        return Promise.resolve({
          ok: false,
          getError: () => ({ message: 'stopped here', origin: 'refusal' }),
        });
      },
    }),
  }),
}));

import { TOOL_DEFINITION as ActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import {
  handleActivateObject,
  TYPE_TO_FAMILY,
} from '../../handlers/common/low/handleActivateObject';

/**
 * Which ADT type code reaches which family's own `activate()`.
 *
 * ADT's structure is `TABL/DS` and its table type `TTYP/DA` (both as ADT
 * names them in `adtcore:type`, e.g. `getTypeInfo.test.ts`). The map used to
 * send `ttyp/st` — a code ADT has never sent — to the structure family, so a
 * structure's real code went to group activation, and a call naming
 * `TTYP/ST` activated a structure of that name. A table type has no family
 * here: it goes to group activation.
 */
const context = { connection: {}, logger: undefined } as never;

describe('ActivateObject: each type code and where it goes', () => {
  beforeEach(() => {
    groupObjects = undefined;
    familyCalls.length = 0;
  });

  it.each([
    ['clas/oc', 'class'],
    ['prog/p', 'program'],
    ['intf/oi', 'interface'],
    ['fugr/f', 'function_group'],
    ['tabl/dt', 'table'],
    ['tabl/ds', 'structure'],
    ['ddls/df', 'ddl'],
    ['doma/dm', 'domain'],
    ['dtel/de', 'data_element'],
    ['bdef/bd', 'behavior_definition'],
    ['bdef/bdo', 'behavior_definition'],
    ['ddlx/ex', 'metadata_extension'],
  ])('%s reaches the %s family', (code, family) => {
    expect(TYPE_TO_FAMILY[code]).toBe(family);
  });

  it.each(['ttyp/da', 'ttyp/st'])('%s has no family', (code) => {
    expect(TYPE_TO_FAMILY[code]).toBeUndefined();
  });

  it("activates a TABL/DS through the structure family's own activate()", async () => {
    await handleActivateObject(context, {
      objects: [{ name: 'zs_x', type: 'TABL/DS' }],
    } as never);
    expect(familyCalls).toEqual(['structure:{"structureName":"ZS_X"}']);
    expect(groupObjects).toBeUndefined();
  });

  it.each(['TTYP/DA', 'TTYP'])(
    'sends a table type (%s) to group activation',
    async (type) => {
      await handleActivateObject(context, {
        objects: [{ name: 'zt_x', type }],
      } as never);
      expect(familyCalls).toEqual([]);
      expect(groupObjects).toEqual([{ name: 'ZT_X', type }]);
    },
  );

  it('ActivateObjects names the codes a table type and a structure are activated by', () => {
    const typeText =
      ActivateObjects.inputSchema.properties.objects.items.properties.type
        .description;
    expect(typeText).toContain('TTYP (table type)');
    expect(typeText).toContain('STRU (structure)');
  });
});
