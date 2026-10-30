/**
 * A main type at the boundary (#329, S4b): where exactly one code of the
 * argument's projection on the declared variant has the main type, the main
 * type goes on as that code — the tool sends exactly the requests the code
 * sends; where two or more codes share it, the call is refused naming those
 * codes and nothing is sent. Either case is taken.
 *
 * Each case runs the tool's own handler over a recording connection declared
 * the variant — real adt-clients code, no SAP.
 */

import type { AdtTypeCode } from '@mcp-abap-adt/interfaces-adt';
import { handleHandlerActivate } from '../../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleHandlerGet } from '../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import { handleGetIncludesList } from '../../../handlers/include/readonly/handleGetIncludesList';
import { handleGetObjectsByType } from '../../../handlers/search/readonly/handleGetObjectsByType';
import { handleGetObjectsList } from '../../../handlers/search/readonly/handleGetObjectsList';
import { handleSearchObject } from '../../../handlers/search/readonly/handleSearchObject';
import { handleGetNodeStructure } from '../../../handlers/system/low/handleGetNodeStructure';
import { handleGetObjectInfo } from '../../../handlers/system/readonly/handleGetObjectInfo';
import { handleGetObjectStructure } from '../../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import {
  ACTIVATION_CODES,
  INCLUDES_PARENT_MAIN_TYPES,
  INCLUDES_PARENTS,
  type ProjectionVariant,
  TABLE_CODES,
  WHERE_USED_CODES,
} from '../../../lib/adtProjections';
import { mainTypeCodeOf, sharedMainType } from '../../../lib/adtTypeCode';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import {
  type RecordedRequest,
  recordingConnection,
} from '../../helpers/recordingConnection';

jest.setTimeout(60_000);

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

/** One argument: how a value is sent, an unambiguous and a shared main type. */
interface Argument {
  readonly tool: string;
  readonly send: (context: HandlerContext, value: string) => Promise<unknown>;
  /** A main type one code of the projection has, with that code. */
  readonly one: readonly [string, string];
  /** A main type two or more codes share, with the codes the refusal names. */
  readonly shared: readonly [string, string];
}

const TABLE_TOOLS: readonly Argument[] = [
  {
    tool: 'GetObjectStructure.object_type',
    send: (context, value) =>
      handleGetObjectStructure(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    one: ['DSFD', 'DSFD/SCF'],
    shared: ['MSAG', 'MSAG/N, MSAG/NN'],
  },
  {
    tool: 'GetNodeStructure.parent_type',
    send: (context, value) =>
      handleGetNodeStructure(context, {
        parent_type: value,
        parent_name: 'ZA',
      }),
    one: ['ENHS', 'ENHS/XSB'],
    shared: ['ENHO', 'ENHO/XHH, ENHO/XHB'],
  },
  {
    tool: 'GetObjectsByType.parent_type',
    send: (context, value) =>
      handleGetObjectsByType(context, {
        parent_type: value,
        parent_name: 'ZA',
        parent_tech_name: 'ZA',
        node_id: '000001',
      }),
    one: ['DSFI', 'DSFI/SFI'],
    shared: ['MSAG', 'MSAG/N, MSAG/NN'],
  },
  {
    tool: 'GetObjectsList.parent_type',
    send: (context, value) =>
      handleGetObjectsList(context, {
        parent_type: value,
        parent_name: 'ZA',
        parent_tech_name: 'ZA',
      }),
    one: ['ENHS', 'ENHS/XSB'],
    shared: ['MSAG', 'MSAG/N, MSAG/NN'],
  },
  {
    tool: 'GetObjectsList.objects[].parent_type',
    send: (context, value) =>
      handleGetObjectsList(context, {
        objects: [{ parent_type: value, parent_name: 'ZA' }],
      }),
    one: ['ENHS', 'ENHS/XSB'],
    shared: ['MSAG', 'MSAG/N, MSAG/NN'],
  },
  {
    tool: 'GetObjectInfo.parent_type',
    send: (context, value) =>
      handleGetObjectInfo(context, { parent_type: value, parent_name: 'ZA' }),
    one: ['DSFD', 'DSFD/SCF'],
    shared: ['ENHO', 'ENHO/XHH, ENHO/XHB'],
  },
  {
    tool: 'GetObjectInfo.objects[].object_type',
    send: (context, value) =>
      handleGetObjectInfo(context, {
        objects: [{ object_type: value, object_name: 'ZA' }],
      }),
    one: ['DSFD', 'DSFD/SCF'],
    shared: ['MSAG', 'MSAG/N, MSAG/NN'],
  },
  {
    tool: 'SearchObject.object_type',
    send: (context, value) =>
      handleSearchObject(context, { object_name: 'Z*', object_type: value }),
    one: ['ENHS', 'ENHS/XSB'],
    shared: ['MSAG', 'MSAG/N, MSAG/NN'],
  },
  {
    tool: 'HandlerGet.object_adt_type (object_structure)',
    send: (context, value) =>
      handleHandlerGet(context, {
        part: 'object_structure',
        object_adt_type: value,
        object_name: 'ZA',
      }),
    one: ['DSFD', 'DSFD/SCF'],
    shared: ['MSAG', 'MSAG/N, MSAG/NN'],
  },
  {
    tool: 'HandlerGet.object_adt_type (node_structure)',
    send: (context, value) =>
      handleHandlerGet(context, {
        part: 'node_structure',
        object_adt_type: value,
        object_name: 'ZA',
      }),
    one: ['ENHS', 'ENHS/XSB'],
    shared: ['ENHO', 'ENHO/XHH, ENHO/XHB'],
  },
];

const ARGUMENTS: readonly Argument[] = [
  {
    tool: 'GetWhereUsed.object_type',
    send: (context, value) =>
      handleGetWhereUsed(context, { object_type: value, object_name: 'ZA' }),
    one: ['MSAG', 'MSAG/N'],
    shared: ['ENHO', 'ENHO/XHH, ENHO/XHB'],
  },
  {
    tool: 'GetWhereUsed.objects[].object_type',
    send: (context, value) =>
      handleGetWhereUsed(context, {
        objects: [
          { object_type: value, object_name: 'ZA' },
          { object_type: value, object_name: 'ZB' },
        ],
      }),
    one: ['MSAG', 'MSAG/N'],
    shared: ['ENHO', 'ENHO/XHH, ENHO/XHB'],
  },
  {
    tool: 'ActivateObjects.objects[].type (group)',
    send: (context, value) =>
      handleActivateObjects(context, {
        objects: [
          { name: 'ZA', type: value },
          { name: 'ZB', type: value },
        ],
      }),
    one: ['ENHS', 'ENHS/XSB'],
    shared: ['ENHO', 'ENHO/XHH, ENHO/XHB'],
  },
  {
    tool: 'ActivateObjects.objects[].type (one object)',
    send: (context, value) =>
      handleActivateObjects(context, {
        objects: [{ name: 'ZA', type: value }],
      }),
    one: ['DSFD', 'DSFD/SCF'],
    shared: ['ENHO', 'ENHO/XHH, ENHO/XHB'],
  },
  {
    tool: 'HandlerActivate.object_adt_type',
    send: (context, value) =>
      handleHandlerActivate(context, {
        object_name: 'ZA',
        object_adt_type: value,
      }),
    one: ['ENHS', 'ENHS/XSB'],
    shared: ['ENHO', 'ENHO/XHH, ENHO/XHB'],
  },
  {
    tool: 'GetIncludesList.object_type',
    send: (context, value) =>
      handleGetIncludesList(context, { object_type: value, object_name: 'ZA' }),
    one: ['FUGR', 'FUGR/F'],
    shared: ['PROG', 'PROG/P, PROG/I'],
  },
  {
    tool: 'GetIncludesList.objects[].object_type',
    send: (context, value) =>
      handleGetIncludesList(context, {
        objects: [{ object_type: value, object_name: 'ZA' }],
      }),
    one: ['CLAS', 'CLAS/OC'],
    shared: ['PROG', 'PROG/P, PROG/I'],
  },
  ...TABLE_TOOLS,
];

/**
 * The answer's text without its escapes: a list answer holds each entry's
 * error as JSON inside the JSON of the content.
 */
const unescaped = (text: string): string => text.replaceAll('\\', '');

/** What the handler answered, thrown or returned, as text. */
function textOf(answered: unknown): string {
  try {
    return JSON.stringify(answered) ?? String(answered);
  } catch {
    return String(answered);
  }
}

/**
 * The requests `send` issues with `value` on `variant`, as text with each
 * batch's random boundary replaced by one fixed name, and its answer.
 */
async function run(
  argument: Argument,
  variant: ProjectionVariant,
  value: string,
): Promise<{ requests: string[]; answered: string }> {
  process.env.SAP_SYSTEM_TYPE = variant;
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  const answered = await argument
    .send({ connection }, value)
    .catch((thrown: unknown) => ({ thrown: String(thrown) }));
  return {
    requests: connection.requests.map((request: RecordedRequest) =>
      JSON.stringify(request).replaceAll(/batch_[0-9a-f-]+/g, 'batch_X'),
    ),
    answered: textOf(answered),
  };
}

describe('a main type is read where it names one code, refused where it names several', () => {
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

  const cases = VARIANTS.flatMap((variant) =>
    ARGUMENTS.map((argument) => [argument.tool, variant, argument] as const),
  );

  it.each(cases)(
    '%s on %s: the main type sends exactly what its code sends, in either case',
    async (_tool, variant, argument) => {
      const [main, code] = argument.one;
      const byCode = await run(argument, variant, code);
      const byMain = await run(argument, variant, main);
      const byLower = await run(argument, variant, main.toLowerCase());
      expect(byCode.requests.length).toBeGreaterThan(0);
      expect(byMain.requests).toEqual(byCode.requests);
      expect(byLower.requests).toEqual(byCode.requests);
    },
  );

  it.each(cases)(
    '%s on %s: a main type codes share is refused naming them, nothing sent',
    async (_tool, variant, argument) => {
      const [main, codes] = argument.shared;
      for (const value of [main, main.toLowerCase()]) {
        const { requests, answered } = await run(argument, variant, value);
        expect(unescaped(answered)).toContain(
          `"${value}" is the main type of ${codes}: name one of these codes; nothing was sent`,
        );
        expect(requests).toEqual([]);
      }
    },
  );

  /**
   * The arguments that take friendly names (`TYPE_NAMES`): a main type is no
   * name there (S4c), so `TABL`, `PROG` and `FUGR` are read through the
   * projection like any other main type.
   */
  const named = ARGUMENTS.filter(
    (argument) => !argument.tool.startsWith('GetIncludesList'),
  );
  const namedCases = VARIANTS.flatMap((variant) =>
    named.map((argument) => [argument.tool, variant, argument] as const),
  );
  const activation = (argument: Argument) =>
    argument.tool.startsWith('ActivateObjects') ||
    argument.tool.startsWith('HandlerActivate');

  it.each(namedCases)(
    '%s on %s: TABL names a table and a structure, so it is refused naming both, nothing sent',
    async (_tool, variant, argument) => {
      for (const value of ['TABL', 'tabl']) {
        const { requests, answered } = await run(argument, variant, value);
        expect(unescaped(answered)).toContain(
          `"${value}" is the main type of TABL/DT, TABL/DS: name one of these codes; nothing was sent`,
        );
        expect(requests).toEqual([]);
      }
    },
  );

  it.each(namedCases)(
    '%s on %s: PROG is refused naming PROG/P and PROG/I where both are served, nothing sent',
    async (_tool, variant, argument) => {
      for (const value of ['PROG', 'prog']) {
        const { requests, answered } = await run(argument, variant, value);
        expect(unescaped(answered)).toContain(
          activation(argument) && variant === 'cloud'
            ? `"${value}" is not one of: CLAS/OC`
            : `"${value}" is the main type of PROG/P, PROG/I: name one of these codes; nothing was sent`,
        );
        expect(requests).toEqual([]);
      }
    },
  );

  it.each(namedCases)(
    '%s on %s: FUGR is refused naming the function codes served, nothing sent',
    async (_tool, variant, argument) => {
      const codes = argument.tool.startsWith('GetWhereUsed')
        ? 'FUGR/F, FUGR/FF'
        : 'FUGR/F, FUGR/FF, FUGR/I';
      const { requests, answered } = await run(argument, variant, 'FUGR');
      expect(unescaped(answered)).toContain(
        `"FUGR" is the main type of ${codes}: name one of these codes; nothing was sent`,
      );
      expect(requests).toEqual([]);
    },
  );

  it.each(namedCases)(
    '%s on %s: CLAS is the one class code, and sends exactly what CLAS/OC sends',
    async (_tool, variant, argument) => {
      const byCode = await run(argument, variant, 'CLAS/OC');
      const byMain = await run(argument, variant, 'CLAS');
      const byLower = await run(argument, variant, 'clas');
      expect(byCode.requests.length).toBeGreaterThan(0);
      expect(byMain.requests).toEqual(byCode.requests);
      expect(byLower.requests).toEqual(byCode.requests);
    },
  );

  it.each(namedCases)(
    '%s on %s: stru/ds is no code and no name, refused, nothing sent; stru is the structure',
    async (_tool, variant, argument) => {
      const refused = await run(argument, variant, 'stru/ds');
      expect(unescaped(refused.answered)).toContain(
        '"stru/ds" is not one of: CLAS/OC',
      );
      expect(refused.requests).toEqual([]);
      // One object of TABL/DS is activated through the structure family;
      // `stru` is no single-activation name and goes to the group (as before).
      if (
        argument.tool === 'ActivateObjects.objects[].type (one object)' ||
        argument.tool === 'HandlerActivate.object_adt_type'
      ) {
        return;
      }
      const byCode = await run(argument, variant, 'TABL/DS');
      const byName = await run(argument, variant, 'stru');
      expect(byCode.requests.length).toBeGreaterThan(0);
      expect(byName.requests).toEqual(byCode.requests);
    },
  );

  /** The arguments `func` is sent through, each with a function module's name. */
  const FUNCTION_MODULE: readonly Argument[] = [
    {
      tool: 'GetWhereUsed.object_type',
      send: (context, value) =>
        handleGetWhereUsed(context, {
          object_type: value,
          object_name: 'ZG|ZA',
        }),
      one: ['func', 'FUGR/FF'],
      shared: ['FUGR', 'FUGR/F, FUGR/FF'],
    },
    {
      tool: 'ActivateObjects.objects[].type (group)',
      send: (context, value) =>
        handleActivateObjects(context, {
          objects: [
            { name: 'ZA', type: value, parentName: 'ZG' },
            { name: 'ZB', type: value, parentName: 'ZG' },
          ],
        }),
      one: ['func', 'FUGR/FF'],
      shared: ['FUGR', 'FUGR/F, FUGR/FF, FUGR/I'],
    },
    ...TABLE_TOOLS,
  ];
  const functionModuleCases = VARIANTS.flatMap((variant) =>
    FUNCTION_MODULE.map(
      (argument) => [argument.tool, variant, argument] as const,
    ),
  );

  it.each(functionModuleCases)(
    '%s on %s: func is the function module, FUGR/FF, not the group',
    async (_tool, variant, argument) => {
      const byModule = await run(argument, variant, 'FUGR/FF');
      const byGroup = await run(argument, variant, 'FUGR/F');
      const byName = await run(argument, variant, 'func');
      const byUpper = await run(argument, variant, 'FUNC');
      expect(byModule.requests.length).toBeGreaterThan(0);
      expect(byName.requests).toEqual(byModule.requests);
      expect(byUpper.requests).toEqual(byModule.requests);
      expect(byName.requests).not.toEqual(byGroup.requests);
    },
  );

  it.each(functionModuleCases)(
    '%s on %s: function is the function module, FUGR/FF, not the group',
    async (_tool, variant, argument) => {
      const byModule = await run(argument, variant, 'FUGR/FF');
      const byGroup = await run(argument, variant, 'FUGR/F');
      const byName = await run(argument, variant, 'function');
      const byUpper = await run(argument, variant, 'FUNCTION');
      expect(byModule.requests.length).toBeGreaterThan(0);
      expect(byName.requests).toEqual(byModule.requests);
      expect(byUpper.requests).toEqual(byModule.requests);
      expect(byName.requests).not.toEqual(byGroup.requests);
    },
  );

  /** The arguments `functiongroup` is sent through, each with a group's name. */
  const FUNCTION_GROUP: readonly Argument[] = [
    {
      tool: 'GetWhereUsed.object_type',
      send: (context, value) =>
        handleGetWhereUsed(context, { object_type: value, object_name: 'ZG' }),
      one: ['functiongroup', 'FUGR/F'],
      shared: ['FUGR', 'FUGR/F, FUGR/FF'],
    },
    {
      tool: 'ActivateObjects.objects[].type (group)',
      send: (context, value) =>
        handleActivateObjects(context, {
          objects: [
            { name: 'ZG', type: value },
            { name: 'ZH', type: value },
          ],
        }),
      one: ['functiongroup', 'FUGR/F'],
      shared: ['FUGR', 'FUGR/F, FUGR/FF, FUGR/I'],
    },
    ...TABLE_TOOLS,
  ];
  const functionGroupCases = VARIANTS.flatMap((variant) =>
    FUNCTION_GROUP.map(
      (argument) => [argument.tool, variant, argument] as const,
    ),
  );

  it.each(functionGroupCases)(
    '%s on %s: functiongroup is the function group, FUGR/F, not the module',
    async (_tool, variant, argument) => {
      const byGroup = await run(argument, variant, 'FUGR/F');
      const byModule = await run(argument, variant, 'FUGR/FF');
      const byName = await run(argument, variant, 'functiongroup');
      const byUpper = await run(argument, variant, 'FUNCTIONGROUP');
      expect(byGroup.requests.length).toBeGreaterThan(0);
      expect(byName.requests).toEqual(byGroup.requests);
      expect(byUpper.requests).toEqual(byGroup.requests);
      expect(byName.requests).not.toEqual(byModule.requests);
    },
  );

  it.each(VARIANTS)(
    'a main type no code of the projection has is refused as any unknown value (%s)',
    async (variant) => {
      const argument = ARGUMENTS.find(
        (each) => each.tool === 'GetWhereUsed.object_type',
      );
      if (argument === undefined) throw new Error('no such argument');
      const { requests, answered } = await run(argument, variant, 'BIMP');
      expect(unescaped(answered)).toContain(
        'object_type "BIMP" is not one of: CLAS/OC',
      );
      expect(requests).toEqual([]);
    },
  );
});

/**
 * Each projection's main types, read by the boundary from the projection's
 * own list: those it reads as one code and those it refuses as shared, in
 * the order the list first names them.
 */
function mainTypesOf(codes: readonly AdtTypeCode[]) {
  const mains = [
    ...new Set(
      codes.flatMap((code) => {
        const slash = code.indexOf('/');
        return slash < 0 ? [] : [code.slice(0, slash)];
      }),
    ),
  ];
  return {
    one: mains.filter((main) => mainTypeCodeOf(main, codes) !== undefined),
    shared: mains.filter(
      (main) => sharedMainType('object_type', main, codes) !== undefined,
    ),
  };
}

/** The main types every code projection of a type argument reads as one. */
const ONE_IN_EVERY = [
  'CLAS',
  'INTF',
  'DEVC',
  'DDLS',
  'TTYP',
  'DOMA',
  'DTEL',
  'DCLS',
  'BDEF',
  'DDLX',
  'SRVD',
  'SRVB',
  'DSFD',
  'DSFI',
  'XSLT',
];

describe("each projection's main types", () => {
  it.each(VARIANTS)(
    'the table: the structure tools and the search filter (%s)',
    (variant) => {
      expect(mainTypesOf(TABLE_CODES[variant])).toEqual({
        one: [...ONE_IN_EVERY, 'FTG2', 'ENHS'],
        shared: ['PROG', 'FUGR', 'TABL', 'MSAG', 'ENHO'],
      });
    },
  );

  it.each(VARIANTS)('where-used (%s)', (variant) => {
    expect(mainTypesOf(WHERE_USED_CODES[variant])).toEqual({
      one: [...ONE_IN_EVERY, 'MSAG', 'FTG2', 'ENHS'],
      shared: ['PROG', 'FUGR', 'TABL', 'ENHO'],
    });
  });

  it('group activation on premise', () => {
    expect(mainTypesOf(ACTIVATION_CODES.onprem)).toEqual({
      one: [...ONE_IN_EVERY, 'FTG2', 'ENHS'],
      shared: ['PROG', 'FUGR', 'TABL', 'ENHO'],
    });
  });

  it('group activation on ABAP cloud', () => {
    expect(mainTypesOf(ACTIVATION_CODES.cloud)).toEqual({
      one: [...ONE_IN_EVERY, 'ENHS'],
      shared: ['FUGR', 'TABL', 'ENHO'],
    });
  });

  it.each(VARIANTS)(
    "GetIncludesList's parents, and the main types its enum lists (%s)",
    (variant) => {
      const read = mainTypesOf(INCLUDES_PARENTS[variant]);
      expect(read).toEqual({ one: ['FUGR', 'CLAS'], shared: ['PROG'] });
      expect([...INCLUDES_PARENT_MAIN_TYPES[variant]]).toEqual(read.one);
    },
  );
});
