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

const families = () => ({
  getClass: activates('class'),
  getProgram: activates('program'),
  getInterface: activates('interface'),
  getFunctionGroup: activates('functionGroup'),
  getTable: activates('table'),
  getStructure: activates('structure'),
  getDdl: activates('ddl'),
  getDomain: activates('domain'),
  getDataElement: activates('dataElement'),
  getBehaviorDefinition: activates('behaviorDefinition'),
  getMetadataExtension: activates('metadataExtension'),
});

import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { TOOL_DEFINITION as ActivateObjects } from '../../handlers/common/high/handleActivateObjects';
import {
  TOOL_DEFINITION as ActivateObjectLow,
  handleActivateObject,
} from '../../handlers/common/low/handleActivateObject';
import {
  SINGLE_ACTIVATION,
  SINGLE_ACTIVATION_NAMES,
  SINGLE_ACTIVATION_ROUTES,
  TYPE_NAMES,
} from '../../lib/adtProjections';
import * as clients from '../../lib/clients';
import { jsonAt, listedJson } from '../helpers/listedJson';
import { stateSystemKind } from '../helpers/systemKind';

{
  const client = () => ({
    ...families(),
    getUtils: () => ({
      // The discovery a group activation reads first: runs are offered.
      discovery: () =>
        Promise.resolve({
          ok: true,
          getResult: () => ({
            value: new Set(['/sap/bc/adt/activation/runs']),
          }),
        }),
      activateObjectsGroup: (objects: unknown) => {
        groupObjects = objects;
        return Promise.resolve({
          ok: false,
          getError: () => ({ message: 'stopped here', origin: 'refusal' }),
        });
      },
    }),
  });
  stateSystemKind('onprem');
  // A program's activation and an on-premise group activation are the
  // on-premise client's.
  mock.method(clients, 'createOnPremAdtClient', client);
  mock.method(clients, 'createAdtClient', client);
}

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

  for (const [code, api] of [
    ['clas/oc', 'class'],
    ['prog/p', 'program'],
    ['intf/oi', 'interface'],
    ['fugr/f', 'functionGroup'],
    ['tabl/dt', 'table'],
    ['tabl/ds', 'structure'],
    ['ddls/df', 'ddl'],
    ['doma/dd', 'domain'],
    ['dtel/de', 'dataElement'],
    ['bdef/bdo', 'behaviorDefinition'],
    ['ddlx/ex', 'metadataExtension'],
  ]) {
    it(format('%s reaches the %s activation', code, api), async () => {
      await handleActivateObject(context, {
        objects: [{ name: 'zobj', type: code }],
      } as never);
      assert.equal(familyCalls.length, 1);
      assert.equal(familyCalls[0]?.startsWith(`${api}:`), true);
      assert.equal(groupObjects, undefined);
    });
  }

  // The served codes (`DOMA/DD`, `BDEF/BDO`) are pinned above; the codes no
  // release lists that the old map read are refused, nothing sent.
  for (const code of ['doma/dm', 'bdef/bd', 'ttyp/st']) {
    it(
      format('%s is no code a single activation or a group takes', code),
      async () => {
        const answered = (await handleActivateObject(context, {
          objects: [{ name: 'zobj', type: code }],
        } as never)) as { isError?: boolean; content: { text: string }[] };
        assert.equal(answered.isError, true);
        assert.ok(
          answered.content[0]?.text.includes(
            `objects[].type "${code}" is not one of: CLAS/OC`,
          ),
        );
        assert.deepStrictEqual(familyCalls, []);
        assert.equal(groupObjects, undefined);
      },
    );
  }

  for (const code of ['ttyp/da', 'ttyp']) {
    it(format('%s has no single activation', code), () => {
      assert.equal(Object.hasOwn(SINGLE_ACTIVATION_ROUTES, code), false);
      assert.equal(
        Object.hasOwn(SINGLE_ACTIVATION_ROUTES, code.toUpperCase()),
        false,
      );
    });
  }

  it("activates a TABL/DS through the structure family's own activate()", async () => {
    await handleActivateObject(context, {
      objects: [{ name: 'zs_x', type: 'TABL/DS' }],
    } as never);
    assert.deepStrictEqual(familyCalls, ['structure:{"structureName":"ZS_X"}']);
    assert.equal(groupObjects, undefined);
  });

  for (const type of ['TTYP/DA', 'TTYP']) {
    it(
      format('sends a table type (%s) to group activation', type),
      async () => {
        await handleActivateObject(context, {
          objects: [{ name: 'zt_x', type }],
        } as never);
        assert.deepStrictEqual(familyCalls, []);
        // A bare main type is read as the code of the tables it names.
        assert.deepStrictEqual(groupObjects, [
          { name: 'ZT_X', type: 'TTYP/DA' },
        ]);
      },
    );
  }

  it('ActivateObjects names the codes a table type and a structure are activated by', () => {
    const typeText =
      jsonAt(listedJson(ActivateObjects.inputSchema), 'objects', '[]', 'type')
        .description ?? '';
    // Each code, with the names that stand for it (`ACTIVATION_NAMES`).
    assert.ok(typeText.includes('TABL/DS (structure, stru)'));
    // A main type is no name: `TTYP` reads as `TTYP/DA` through the
    // projection, so `ttyp` stands beside no code.
    assert.ok(typeText.includes('TTYP/DA, '));
    assert.ok(!typeText.includes('(ttyp)'));
    // A bare main type no table lists is not offered.
    assert.ok(!typeText.includes('ENHO ('));
  });
});

/**
 * Which codes take single-object activation is said in the preaudit text,
 * and taken from the map, so the two cannot drift. A main type (`CLAS`) is
 * not listed: the text's own sentence says a main type standing for a listed
 * code takes it too.
 */
describe('the preaudit text names exactly the codes the map routes to a family', () => {
  const codesIn = (text: string) => {
    const marker = 'single-object activation: ';
    const start = text.indexOf(marker);
    assert.ok(start >= 0);
    const end = text.indexOf('.', start);
    return text
      .slice(start + marker.length, end)
      .split(', ')
      .map((code) => code.toLowerCase())
      .sort();
  };

  for (const [_tool, text] of [
    [
      'ActivateObjects',
      jsonAt(listedJson(ActivateObjects.inputSchema), 'preaudit').description ??
        '',
    ],
    [
      'ActivateObjectLow',
      jsonAt(listedJson(ActivateObjectLow.inputSchema), 'preaudit')
        .description ?? '',
    ],
  ]) {
    it(format('%s', _tool), () => {
      // The projection of the variant (`SINGLE_ACTIVATION`), every value of
      // which `SINGLE_ACTIVATION_ROUTES` routes to its API's activation, then
      // the names standing for those codes (`SINGLE_ACTIVATION_NAMES`), each
      // routed as its code; the codes no table holds (`doma/dm`, `bdef/bd`)
      // are not offered.
      assert.deepStrictEqual(
        codesIn(text),
        [...SINGLE_ACTIVATION.onprem, ...SINGLE_ACTIVATION_NAMES.onprem]
          .map((code) => code.toLowerCase())
          .sort(),
      );
      const routed = [
        ...Object.keys(SINGLE_ACTIVATION_ROUTES),
        ...SINGLE_ACTIVATION_NAMES.onprem.filter((name) =>
          Object.hasOwn(SINGLE_ACTIVATION_ROUTES, TYPE_NAMES[name]),
        ),
      ].map((code) => code.toLowerCase());
      for (const code of codesIn(text)) {
        assert.ok(routed.includes(code));
      }
      assert.ok(!codesIn(text).includes('clas'));
      assert.ok(!codesIn(text).includes('doma/dm'));
    });
  }
});
