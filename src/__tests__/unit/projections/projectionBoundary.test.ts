/**
 * The boundary of every argument that names a type (#329, S4): a code
 * argument is upper-cased once and checked against its operation's
 * projection on the declared variant, a friendly-name argument against the
 * accepted names. For each operation family: a valid value reaches the
 * client (a request is sent), a wrong value is refused naming what the
 * argument takes there, with nothing sent, and a friendly name is accepted
 * where the projection takes names and refused where it takes codes.
 *
 * Each case runs the tool's own handler over a recording connection declared
 * the variant — real adt-clients code, no SAP.
 */
import {
  TOOL_DEFINITION as HandlerActivate,
  handleHandlerActivate,
} from '../../../../compact-modify/src/handlers/handleHandlerActivate';
import {
  TOOL_DEFINITION as HandlerCreate,
  handleHandlerCreate,
} from '../../../../compact-modify/src/handlers/handleHandlerCreate';
import {
  TOOL_DEFINITION as HandlerLock,
  handleHandlerLock,
} from '../../../../compact-modify/src/handlers/handleHandlerLock';
import {
  TOOL_DEFINITION as HandlerUnlock,
  handleHandlerUnlock,
} from '../../../../compact-modify/src/handlers/handleHandlerUnlock';
import {
  TOOL_DEFINITION as HandlerUpdate,
  handleHandlerUpdate,
} from '../../../../compact-modify/src/handlers/handleHandlerUpdate';
import {
  TOOL_DEFINITION as HandlerCheckRun,
  handleHandlerCheckRun,
} from '../../../../compact-readonly-entries/src/handlers/handleHandlerCheckRun';
import {
  TOOL_DEFINITION as HandlerDeletionCheck,
  handleHandlerDeletionCheck,
} from '../../../../compact-readonly-entries/src/handlers/handleHandlerDeletionCheck';
import {
  TOOL_DEFINITION as HandlerGet,
  handleHandlerGet,
} from '../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import {
  TOOL_DEFINITION as HandlerValidate,
  handleHandlerValidate,
} from '../../../../compact-readonly-entries/src/handlers/handleHandlerValidate';
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import {
  TOOL_DEFINITION as CheckObjectLow,
  handleCheckObject,
} from '../../../handlers/common/low/handleCheckObject';
import { handleDeleteOnly } from '../../../handlers/common/low/handleDeleteOnly';
import {
  handleLockObject,
  TOOL_DEFINITION as LockObjectLow,
} from '../../../handlers/common/low/handleLockObject';
import {
  handleUnlockObject,
  TOOL_DEFINITION as UnlockObjectLow,
} from '../../../handlers/common/low/handleUnlockObject';
import {
  handleValidateObject,
  TOOL_DEFINITION as ValidateObjectLow,
} from '../../../handlers/common/low/handleValidateObject';
import {
  TOOL_DEFINITION as GetObjectVersionDiff,
  handleGetObjectVersionDiff,
} from '../../../handlers/common/readonly/handleGetObjectVersionDiff';
import {
  TOOL_DEFINITION as GetObjectVersionSource,
  handleGetObjectVersionSource,
} from '../../../handlers/common/readonly/handleGetObjectVersionSource';
import {
  TOOL_DEFINITION as GetObjectVersions,
  handleGetObjectVersions,
} from '../../../handlers/common/readonly/handleGetObjectVersions';
import {
  TOOL_DEFINITION as GetIncludesList,
  handleGetIncludesList,
} from '../../../handlers/include/readonly/handleGetIncludesList';
import { handleGetObjectsByType } from '../../../handlers/search/readonly/handleGetObjectsByType';
import { handleSearchObject } from '../../../handlers/search/readonly/handleSearchObject';
import { handleGetNodeStructure } from '../../../handlers/system/low/handleGetNodeStructure';
import { handleGetObjectStructure } from '../../../handlers/system/readonly/handleGetObjectStructure';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import type { ProjectionVariant } from '../../../lib/adtProjections';
import {
  breakpointLabelOf,
  sourceUriOf,
} from '../../../lib/debugger/objectUri';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { defineTool } from '../../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { moduleInGroup } from '../../helpers/functionModuleMetadata';
import { holding } from '../../helpers/heldLocks';
import { recordingConnection } from '../../helpers/recordingConnection';

jest.setTimeout(60_000);

/** What a case must show: a request sent, or the refusal's words and none. */
type Expected = 'sent' | { readonly refused: string };

interface Case {
  readonly family: string;
  readonly variant: ProjectionVariant;
  readonly what: string;
  readonly send: (context: HandlerContext) => Promise<unknown>;
  readonly expected: Expected;
}

const sent: Expected = 'sent';
const refused = (words: string): Expected => ({ refused: words });
/**
 * A value the tool's schema refuses: the model's call is refused at the
 * boundary, before the handler, naming the argument.
 */
const schemaRefused = (tool: string): Expected =>
  refused(`Invalid arguments for tool ${tool}: `);

/** The four cases of one argument on one variant: valid, lower, name, wrong. */
function family(
  name: string,
  variant: ProjectionVariant,
  send: (context: HandlerContext, value: string) => Promise<unknown>,
  values: {
    readonly valid: string;
    /** What a lower-case value answers; sent when absent. */
    readonly lower?: Expected;
    readonly name: readonly [string, Expected];
    readonly wrong: readonly [string, string] | readonly [string, Expected];
  },
): Case[] {
  const at = (what: string, value: string, expected: Expected): Case => ({
    family: name,
    variant,
    what: `${what} ${value}`,
    send: (context) => send(context, value),
    expected,
  });
  return [
    at('valid', values.valid, sent),
    at('lower-case', values.valid.toLowerCase(), values.lower ?? sent),
    at('friendly name', values.name[0], values.name[1]),
    at(
      'wrong',
      values.wrong[0],
      typeof values.wrong[1] === 'string'
        ? refused(values.wrong[1])
        : values.wrong[1],
    ),
  ];
}

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

const CASES: readonly Case[] = VARIANTS.flatMap((variant) => [
  // Codes and the names standing for them.
  ...family(
    'GetWhereUsed.object_type',
    variant,
    (context, value) =>
      handleGetWhereUsed(context, { object_type: value, object_name: 'ZA' }),
    {
      valid: 'CLAS/OC',
      name: ['class', sent],
      wrong: ['INTF/IF', 'object_type "INTF/IF" is not one of: CLAS/OC'],
    },
  ),
  ...family(
    'ActivateObjects.objects[].type (group)',
    variant,
    (context, value) =>
      handleActivateObjects(context, {
        objects: [
          { name: 'ZA', type: value },
          { name: 'ZB', type: value },
        ],
      }),
    {
      valid: 'DEVC/K',
      name: ['package', sent],
      wrong: ['DOMA/DM', 'objects[].type "DOMA/DM" is not one of: CLAS/OC'],
    },
  ),
  ...family(
    'ActivateObjects.objects[].type (one object)',
    variant,
    (context, value) =>
      handleActivateObjects(context, {
        objects: [{ name: 'ZA', type: value }],
      }),
    {
      valid: 'DOMA/DD',
      name: ['domain', sent],
      wrong: ['BDEF/BD', 'objects[].type "BDEF/BD" is not one of: CLAS/OC'],
    },
  ),
  // Codes only, through the tool's entry: a value outside the schema's
  // members is refused there, before the handler.
  ...family(
    'GetIncludesList.object_type',
    variant,
    (context, value) =>
      defineTool(GetIncludesList, handleGetIncludesList).call(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'PROG/P',
      lower: schemaRefused('GetIncludesList'),
      name: ['program', schemaRefused('GetIncludesList')],
      wrong: ['FUGR/FF', schemaRefused('GetIncludesList')],
    },
  ),
  // Any code of the variant's table, or a name.
  ...family(
    'GetObjectStructure.object_type',
    variant,
    (context, value) =>
      handleGetObjectStructure(context, {
        objecttype: value,
        objectname: 'ZA',
      }),
    {
      valid: 'CLAS/OC',
      name: ['class', sent],
      wrong: [
        'STRU/DT',
        'objecttype/object_type "STRU/DT" is not one of: CLAS/OC',
      ],
    },
  ),
  ...family(
    'GetNodeStructure.parent_type',
    variant,
    (context, value) =>
      handleGetNodeStructure(context, {
        parent_type: value,
        parent_name: 'ZA',
      }),
    {
      valid: 'DEVC/K',
      name: ['package', sent],
      wrong: ['TTYP/DF', 'parent_type "TTYP/DF" is not one of: CLAS/OC'],
    },
  ),
  ...family(
    'GetObjectsByType.parent_type',
    variant,
    (context, value) =>
      handleGetObjectsByType(context, {
        parent_type: value,
        parent_name: 'ZA',
        parent_tech_name: 'ZA',
        node_id: '000001',
      }),
    {
      valid: 'FUGR/F',
      name: ['functiongroup', sent],
      wrong: ['FUGR/FC', 'parent_type "FUGR/FC" is not one of: CLAS/OC'],
    },
  ),
  ...family(
    'SearchObject.object_type',
    variant,
    (context, value) =>
      handleSearchObject(context, { object_name: 'Z*', object_type: value }),
    // The filter takes the variant's search names; a code stands for the
    // name that selects it (`searchTypes.ts`).
    {
      valid: 'DDLS/DF',
      name: ['ddls', sent],
      wrong: [
        'NOPE',
        'object_type "NOPE" is neither a name of this system\'s object types list nor an ADT type code or a name standing for one: it takes the search names',
      ],
    },
  ),
  // The version tools' kinds, through each tool's entry: its schema lists
  // them in lower case and refuses anything else.
  ...family(
    'GetObjectVersions.object_type',
    variant,
    (context, value) =>
      defineTool(GetObjectVersions, handleGetObjectVersions).call(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'class',
      name: ['CLAS/OC', schemaRefused('GetObjectVersions')],
      wrong: ['domain', schemaRefused('GetObjectVersions')],
    },
  ),
  ...family(
    'GetObjectVersionSource.object_type',
    variant,
    (context, value) =>
      defineTool(GetObjectVersionSource, handleGetObjectVersionSource).call(
        context,
        {
          object_type: value,
          content_uri:
            '/sap/bc/adt/oo/classes/za/source/main/versions/00001/content',
        },
      ),
    {
      valid: 'class',
      name: ['CLAS/OC', schemaRefused('GetObjectVersionSource')],
      wrong: ['domain', schemaRefused('GetObjectVersionSource')],
    },
  ),
  ...family(
    'GetObjectVersionDiff.object_type',
    variant,
    (context, value) =>
      defineTool(GetObjectVersionDiff, handleGetObjectVersionDiff).call(
        context,
        {
          object_type: value,
          content_uri_from:
            '/sap/bc/adt/oo/classes/za/source/main/versions/00001/content',
          content_uri_to:
            '/sap/bc/adt/oo/classes/za/source/main/versions/00002/content',
        },
      ),
    {
      valid: 'class',
      name: ['CLAS/OC', schemaRefused('GetObjectVersionDiff')],
      wrong: ['domain', schemaRefused('GetObjectVersionDiff')],
    },
  ),
  // The low object tools' kinds, through each tool's entry: its schema
  // lists the kinds in lower case and refuses anything else.
  ...family(
    'CheckObjectLow.object_type',
    variant,
    (context, value) =>
      defineTool(CheckObjectLow, handleCheckObject).call(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'class',
      name: ['CLAS/OC', schemaRefused('CheckObjectLow')],
      wrong: ['service_binding', schemaRefused('CheckObjectLow')],
    },
  ),
  ...family(
    'LockObjectLow.object_type',
    variant,
    (context, value) =>
      defineTool(LockObjectLow, handleLockObject).call(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'class',
      name: ['CLAS/OC', schemaRefused('LockObjectLow')],
      wrong: ['transport', schemaRefused('LockObjectLow')],
    },
  ),
  ...family(
    'UnlockObjectLow.object_type',
    variant,
    (context, value) =>
      defineTool(UnlockObjectLow, handleUnlockObject).call(context, {
        object_type: value,
        object_name: 'ZA',
        lock_handle: 'LOCKHANDLE',
      }),
    {
      valid: 'class',
      name: ['CLAS/OC', schemaRefused('UnlockObjectLow')],
      wrong: ['transport', schemaRefused('UnlockObjectLow')],
    },
  ),
  ...family(
    'ValidateObjectLow.object_type',
    variant,
    (context, value) =>
      defineTool(ValidateObjectLow, handleValidateObject).call(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'class',
      name: ['CLAS/OC', schemaRefused('ValidateObjectLow')],
      wrong: ['transport', schemaRefused('ValidateObjectLow')],
    },
  ),
  // The compact tools' names: a code is no compact name.
  // Through the tool's entry, as the model's call: a value outside its
  // schema's members is refused there, before the handler.
  ...family(
    'HandlerActivate.object_type',
    variant,
    (context, value) =>
      defineTool(HandlerActivate, handleHandlerActivate).call(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      lower: schemaRefused('HandlerActivate'),
      name: ['CLAS/OC', schemaRefused('HandlerActivate')],
      wrong: ['UNIT_TEST', schemaRefused('HandlerActivate')],
    },
  ),
  // Through the tool's entry, as the model's call: a value outside its
  // schema's members is refused there, before the handler.
  ...family(
    'HandlerCreate.object_type',
    variant,
    (context, value) =>
      defineTool(HandlerCreate, handleHandlerCreate).call(context, {
        object_type: value,
        class_name: 'ZA',
        package_name: 'ZPKG',
      }),
    {
      valid: 'CLASS',
      lower: schemaRefused('HandlerCreate'),
      name: ['CLAS/OC', schemaRefused('HandlerCreate')],
      wrong: ['RUNTIME_DUMP', schemaRefused('HandlerCreate')],
    },
  ),
  // Through the tool's entry, as the model's call: a value outside its
  // schema's members is refused there, before the handler.
  ...family(
    'HandlerGet.object_type',
    variant,
    (context, value) =>
      defineTool(HandlerGet, handleHandlerGet).call(context, {
        object_type: value,
        class_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      lower: schemaRefused('HandlerGet'),
      name: ['CLAS/OC', schemaRefused('HandlerGet')],
      wrong: ['RUNTIME_DUMP', schemaRefused('HandlerGet')],
    },
  ),
  // Through the tool's entry, as the model's call: a value outside its
  // schema's members is refused there, before the handler.
  ...family(
    'HandlerUpdate.object_type',
    variant,
    (context, value) =>
      defineTool(HandlerUpdate, handleHandlerUpdate).call(context, {
        object_type: value,
        class_name: 'ZA',
        source_code: 'X',
        lock_handle: 'LOCKHANDLE',
      }),
    {
      valid: 'CLASS',
      lower: schemaRefused('HandlerUpdate'),
      name: ['CLAS/OC', schemaRefused('HandlerUpdate')],
      wrong: ['TRANSPORT', schemaRefused('HandlerUpdate')],
    },
  ),
  // Through the tool's entry, as the model's call: a value outside its
  // schema's members is refused there, before the handler.
  ...family(
    'HandlerCheckRun.object_type',
    variant,
    (context, value) =>
      defineTool(HandlerCheckRun, handleHandlerCheckRun).call(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      lower: schemaRefused('HandlerCheckRun'),
      name: ['CLAS/OC', schemaRefused('HandlerCheckRun')],
      wrong: ['TRANSPORT', schemaRefused('HandlerCheckRun')],
    },
  ),
  // Through the tool's entry, as the model's call: a value outside its
  // schema's members is refused there, before the handler.
  ...family(
    'HandlerLock.object_type',
    variant,
    (context, value) =>
      defineTool(HandlerLock, handleHandlerLock).call(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      lower: schemaRefused('HandlerLock'),
      name: ['CLAS/OC', schemaRefused('HandlerLock')],
      wrong: ['TRANSPORT', schemaRefused('HandlerLock')],
    },
  ),
  // Through the tool's entry, as the model's call: a value outside its
  // schema's members is refused there, before the handler.
  ...family(
    'HandlerUnlock.object_type',
    variant,
    (context, value) =>
      defineTool(HandlerUnlock, handleHandlerUnlock).call(context, {
        object_type: value,
        object_name: 'ZA',
        lock_handle: 'LOCKHANDLE',
      }),
    {
      valid: 'CLASS',
      lower: schemaRefused('HandlerUnlock'),
      name: ['CLAS/OC', schemaRefused('HandlerUnlock')],
      wrong: ['TRANSPORT', schemaRefused('HandlerUnlock')],
    },
  ),
  // Through the tool's entry, as the model's call: a value outside its
  // schema's members is refused there, before the handler.
  ...family(
    'HandlerValidate.object_type',
    variant,
    (context, value) =>
      defineTool(HandlerValidate, handleHandlerValidate).call(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      lower: schemaRefused('HandlerValidate'),
      name: ['CLAS/OC', schemaRefused('HandlerValidate')],
      wrong: ['TRANSPORT', schemaRefused('HandlerValidate')],
    },
  ),
  ...family(
    'HandlerDelete.object_type',
    variant,
    (context, value) =>
      handleDeleteOnly(context, {
        object_type: value,
        class_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Unsupported delete for object_type: CLAS/OC. Supported:'),
      ],
      wrong: [
        'TRANSPORT',
        'Unsupported delete for object_type: TRANSPORT. Supported:',
      ],
    },
  ),
  // Through the tool's entry, as the model's call: a value outside its
  // schema's members is refused there, before the handler.
  ...family(
    'HandlerDeletionCheck.object_type',
    variant,
    (context, value) =>
      defineTool(HandlerDeletionCheck, handleHandlerDeletionCheck).call(
        context,
        {
          object_type: value,
          object_name: 'ZA',
        },
      ),
    {
      valid: 'CLASS',
      lower: schemaRefused('HandlerDeletionCheck'),
      name: ['CLAS/OC', schemaRefused('HandlerDeletionCheck')],
      wrong: ['TRANSPORT', schemaRefused('HandlerDeletionCheck')],
    },
  ),
]);

/** What only the on-premise table serves is refused on ABAP cloud. */
const CLOUD_REFUSALS: readonly Case[] = [
  {
    family: 'ActivateObjects.objects[].type (group)',
    variant: 'cloud',
    what: 'on-premise only PROG/I',
    send: (context) =>
      handleActivateObjects(context, {
        objects: [
          { name: 'ZA', type: 'PROG/I' },
          { name: 'ZB', type: 'PROG/I' },
        ],
      }),
    expected: refused('objects[].type "PROG/I" is not one of: CLAS/OC'),
  },
  {
    family: 'HandlerActivate.object_type',
    variant: 'cloud',
    what: 'on-premise only PROGRAM',
    send: (context) =>
      handleHandlerActivate(context, {
        object_type: 'PROGRAM',
        object_name: 'ZA',
      }),
    expected: refused(
      'cannot turn object_type "PROGRAM" into an ADT type code',
    ),
  },
  {
    family: 'LockObjectLow.object_type',
    variant: 'cloud',
    what: 'on-premise only program',
    send: (context) =>
      handleLockObject(context, { object_type: 'program', object_name: 'ZA' }),
    expected: refused('Invalid object_type. Must be one of: class, interface'),
  },
];

/** What the handler answered, thrown or returned, as text. */
function textOf(answered: unknown): string {
  try {
    return JSON.stringify(answered) ?? String(answered);
  } catch {
    return String(answered);
  }
}

describe('every type argument is checked once, against its projection', () => {
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

  it.each(
    [...CASES, ...CLOUD_REFUSALS].map(
      (each) => [each.family, each.variant, each.what, each] as const,
    ),
  )('%s on %s: %s', async (_family, variant, _what, each) => {
    process.env.SAP_SYSTEM_TYPE = variant;
    const connection = recordingConnection();
    declareSystemKind(connection, variant);
    const answered = await each
      // The instance locked what the cases write under.
      .send({ connection, heldLocks: holding('LOCKHANDLE') })
      .catch((thrown: unknown) => ({ thrown: String(thrown) }));
    if (each.expected === 'sent') {
      expect({
        sent: connection.requests.length > 0,
        answered: connection.requests.length > 0 ? '' : textOf(answered),
      }).toEqual({ sent: true, answered: '' });
      return;
    }
    // The words as they stand inside the answer's JSON.
    expect(textOf(answered)).toContain(
      JSON.stringify(each.expected.refused).slice(1, -1),
    );
    expect(connection.requests).toEqual([]);
  });
});

describe('HandlerActivate: a function module and a behaviour implementation', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  afterEach(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  // A function module's metadata, read first, names ZFG_A (#2).
  const on = (variant: ProjectionVariant) => {
    process.env.SAP_SYSTEM_TYPE = variant;
    const connection = recordingConnection([moduleInGroup('Z_FM_A', 'ZFG_A')]);
    declareSystemKind(connection, variant);
    return connection;
  };

  it.each(VARIANTS)(
    'a function module is activated under its group, named GROUP|MODULE (%s)',
    async (variant) => {
      const connection = on(variant);
      await handleHandlerActivate(
        { connection },
        { object_type: 'FUNCTION_MODULE', object_name: 'zfg_a|z_fm_a' },
      );
      const [metadata, request] = connection.requests;
      expect(metadata?.url).toBe(
        '/sap/bc/adt/functions/groups/zfg_a/fmodules/z_fm_a?version=workingArea',
      );
      expect(request?.url).toContain('/activation/runs');
      expect(String(request?.data)).toContain(
        '/sap/bc/adt/functions/groups/zfg_a/fmodules/z_fm_a',
      );
      expect(String(request?.data)).toContain('FUGR/FF');
    },
  );

  it.each(VARIANTS)(
    'a function module is activated under its group, named by function_group_name (%s)',
    async (variant) => {
      const connection = on(variant);
      await handleHandlerActivate(
        { connection },
        {
          object_type: 'FUNCTION_MODULE',
          object_name: 'Z_FM_A',
          function_group_name: 'zfg_a',
        },
      );
      expect(String(connection.requests[1]?.data)).toContain(
        '/sap/bc/adt/functions/groups/zfg_a/fmodules/z_fm_a',
      );
    },
  );

  it.each(VARIANTS)(
    'a function module without its group is refused, nothing sent (%s)',
    async (variant) => {
      const connection = on(variant);
      const answered = await handleHandlerActivate(
        { connection },
        { object_type: 'FUNCTION_MODULE', object_name: 'Z_FM_A' },
      );
      expect(textOf(answered)).toContain(
        'FUNCTION_MODULE is named GROUP|MODULE in object_name, or with function_group_name',
      );
      expect(connection.requests).toEqual([]);
    },
  );

  it.each(VARIANTS)(
    'two groups named for one module are refused, nothing sent (%s)',
    async (variant) => {
      const connection = on(variant);
      const answered = await handleHandlerActivate(
        { connection },
        {
          object_type: 'FUNCTION_MODULE',
          object_name: 'ZFG_A|Z_FM_A',
          function_group_name: 'ZFG_B',
        },
      );
      expect(textOf(answered)).toContain('give the group once');
      expect(connection.requests).toEqual([]);
    },
  );

  it.each(VARIANTS)(
    'a behaviour implementation is activated as its class (%s)',
    async (variant) => {
      const connection = on(variant);
      await handleHandlerActivate(
        { connection },
        { object_type: 'BEHAVIOR_IMPLEMENTATION', object_name: 'zbp_a' },
      );
      const [request] = connection.requests;
      expect(request?.url).toContain('/sap/bc/adt/activation');
      expect(String(request?.data)).toContain('/sap/bc/adt/oo/classes/zbp_a');
    },
  );
});

describe("the debugger's labels and their codes", () => {
  it.each([
    ['CLAS', 'CLAS'],
    ['clas/oc', 'CLAS'],
    ['PROG/P', 'PROG'],
    ['incl', 'INCL'],
    ['PROG/I', 'INCL'],
    ['FUNC', 'FUNC'],
    ['fugr/ff', 'FUNC'],
  ])('%s is the label %s', (text, label) => {
    expect(breakpointLabelOf(text)).toBe(label);
  });

  it.each(['FUGR', 'FUGR/F', 'INTF/OI', 'doma/dm'])(
    '%s is no breakpoint label',
    (text) => {
      expect(breakpointLabelOf(text)).toBeUndefined();
      expect(() =>
        sourceUriOf({ object_type: text, object_name: 'ZA' }),
      ).toThrow('holds no breakpoint; one of CLAS, PROG, INCL, FUNC');
    },
  );

  it('FUNC is a function module, addressed under its group', () => {
    expect(
      sourceUriOf({
        object_type: 'FUNC',
        object_name: 'Z_FM_A',
        parent_name: 'ZFG_A',
      }),
    ).toBe('/sap/bc/adt/functions/groups/zfg_a/fmodules/z_fm_a/source/main');
  });
});
