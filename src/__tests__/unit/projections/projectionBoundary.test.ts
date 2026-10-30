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
import { handleHandlerActivate } from '../../../../compact-modify/src/handlers/handleHandlerActivate';
import { handleHandlerCreate } from '../../../../compact-modify/src/handlers/handleHandlerCreate';
import { handleHandlerLock } from '../../../../compact-modify/src/handlers/handleHandlerLock';
import { handleHandlerUnlock } from '../../../../compact-modify/src/handlers/handleHandlerUnlock';
import { handleHandlerUpdate } from '../../../../compact-modify/src/handlers/handleHandlerUpdate';
import { handleHandlerCheckRun } from '../../../../compact-readonly-entries/src/handlers/handleHandlerCheckRun';
import { handleHandlerDeletionCheck } from '../../../../compact-readonly-entries/src/handlers/handleHandlerDeletionCheck';
import { handleHandlerGet } from '../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import { handleHandlerValidate } from '../../../../compact-readonly-entries/src/handlers/handleHandlerValidate';
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import { handleCheckObject } from '../../../handlers/common/low/handleCheckObject';
import { handleDeleteOnly } from '../../../handlers/common/low/handleDeleteOnly';
import { handleLockObject } from '../../../handlers/common/low/handleLockObject';
import { handleUnlockObject } from '../../../handlers/common/low/handleUnlockObject';
import { handleValidateObject } from '../../../handlers/common/low/handleValidateObject';
import { handleGetObjectVersionDiff } from '../../../handlers/common/readonly/handleGetObjectVersionDiff';
import { handleGetObjectVersionSource } from '../../../handlers/common/readonly/handleGetObjectVersionSource';
import { handleGetObjectVersions } from '../../../handlers/common/readonly/handleGetObjectVersions';
import { handleGetIncludesList } from '../../../handlers/include/readonly/handleGetIncludesList';
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
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
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

/** The four cases of one argument on one variant: valid, lower, name, wrong. */
function family(
  name: string,
  variant: ProjectionVariant,
  send: (context: HandlerContext, value: string) => Promise<unknown>,
  values: {
    readonly valid: string;
    readonly name: readonly [string, Expected];
    readonly wrong: readonly [string, string];
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
    at('lower-case', values.valid.toLowerCase(), sent),
    at('friendly name', values.name[0], values.name[1]),
    at('wrong', values.wrong[0], refused(values.wrong[1])),
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
  // Codes only.
  ...family(
    'GetIncludesList.object_type',
    variant,
    (context, value) =>
      handleGetIncludesList(context, { object_type: value, object_name: 'ZA' }),
    {
      valid: 'PROG/P',
      name: [
        'program',
        refused('Unsupported object_type "program": Supported: PROG/P'),
      ],
      wrong: [
        'FUGR/FF',
        'Unsupported object_type "FUGR/FF": Supported: PROG/P',
      ],
    },
  ),
  // Any code of the variant's table, or a name.
  ...family(
    'GetObjectStructure.object_type',
    variant,
    (context, value) =>
      handleGetObjectStructure(context, {
        object_type: value,
        object_name: 'ZA',
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
        'object_type "NOPE" is neither a name of this system\'s object types list nor an ADT type code standing for one: it takes the search names',
      ],
    },
  ),
  // The version tools' kinds.
  ...family(
    'GetObjectVersions.object_type',
    variant,
    (context, value) =>
      handleGetObjectVersions(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Invalid object_type. Must be one of: class, program'),
      ],
      wrong: ['domain', 'Invalid object_type. Must be one of: class, program'],
    },
  ),
  ...family(
    'GetObjectVersionSource.object_type',
    variant,
    (context, value) =>
      handleGetObjectVersionSource(context, {
        object_type: value,
        content_uri:
          '/sap/bc/adt/oo/classes/za/source/main/versions/00001/content',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Invalid object_type. Must be one of: class, program'),
      ],
      wrong: ['domain', 'Invalid object_type. Must be one of: class, program'],
    },
  ),
  ...family(
    'GetObjectVersionDiff.object_type',
    variant,
    (context, value) =>
      handleGetObjectVersionDiff(context, {
        object_type: value,
        content_uri_from:
          '/sap/bc/adt/oo/classes/za/source/main/versions/00001/content',
        content_uri_to:
          '/sap/bc/adt/oo/classes/za/source/main/versions/00002/content',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Invalid object_type. Must be one of: class, program'),
      ],
      wrong: ['domain', 'Invalid object_type. Must be one of: class, program'],
    },
  ),
  // The low object tools' kinds.
  ...family(
    'CheckObjectLow.object_type',
    variant,
    (context, value) =>
      handleCheckObject(context, { object_type: value, object_name: 'ZA' }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Invalid object_type. Must be one of: class, program'),
      ],
      wrong: [
        'service_binding',
        'Invalid object_type. Must be one of: class, program',
      ],
    },
  ),
  ...family(
    'LockObjectLow.object_type',
    variant,
    (context, value) =>
      handleLockObject(context, { object_type: value, object_name: 'ZA' }),
    {
      valid: 'CLASS',
      name: ['CLAS/OC', refused('Invalid object_type. Must be one of: class,')],
      wrong: ['transport', 'Invalid object_type. Must be one of: class,'],
    },
  ),
  ...family(
    'UnlockObjectLow.object_type',
    variant,
    (context, value) =>
      handleUnlockObject(context, {
        object_type: value,
        object_name: 'ZA',
        lock_handle: 'LOCKHANDLE',
      }),
    {
      valid: 'CLASS',
      name: ['CLAS/OC', refused('Invalid object_type. Must be one of: class,')],
      wrong: ['transport', 'Invalid object_type. Must be one of: class,'],
    },
  ),
  ...family(
    'ValidateObjectLow.object_type',
    variant,
    (context, value) =>
      handleValidateObject(context, { object_type: value, object_name: 'ZA' }),
    {
      valid: 'CLASS',
      name: ['CLAS/OC', refused('Invalid object_type. Must be one of: class,')],
      wrong: ['transport', 'Invalid object_type. Must be one of: class,'],
    },
  ),
  // The compact tools' names: a code is no compact name.
  ...family(
    'HandlerActivate.object_type',
    variant,
    (context, value) =>
      handleHandlerActivate(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('cannot turn object_type "CLAS/OC" into an ADT type code'),
      ],
      wrong: [
        'UNIT_TEST',
        'cannot turn object_type "UNIT_TEST" into an ADT type code',
      ],
    },
  ),
  ...family(
    'HandlerCreate.object_type',
    variant,
    (context, value) =>
      handleHandlerCreate(context, {
        object_type: value,
        class_name: 'ZA',
        package_name: 'ZPKG',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Unsupported create for object_type: CLAS/OC. Supported:'),
      ],
      wrong: [
        'RUNTIME_DUMP',
        'Unsupported create for object_type: RUNTIME_DUMP. Supported:',
      ],
    },
  ),
  ...family(
    'HandlerGet.object_type',
    variant,
    (context, value) =>
      handleHandlerGet(context, { object_type: value, class_name: 'ZA' }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Unsupported read for object_type: CLAS/OC. Supported:'),
      ],
      wrong: [
        'RUNTIME_DUMP',
        'Unsupported read for object_type: RUNTIME_DUMP. Supported:',
      ],
    },
  ),
  ...family(
    'HandlerUpdate.object_type',
    variant,
    (context, value) =>
      handleHandlerUpdate(context, {
        object_type: value,
        class_name: 'ZA',
        source_code: 'X',
        lock_handle: 'LOCKHANDLE',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Unsupported update for object_type: CLAS/OC. Supported:'),
      ],
      wrong: [
        'TRANSPORT',
        'Unsupported update for object_type: TRANSPORT. Supported:',
      ],
    },
  ),
  ...family(
    'HandlerCheckRun.object_type',
    variant,
    (context, value) =>
      handleHandlerCheckRun(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('CheckRun is not supported for object_type: CLAS/OC'),
      ],
      wrong: [
        'TRANSPORT',
        'CheckRun is not supported for object_type: TRANSPORT. Supported: CLASS',
      ],
    },
  ),
  ...family(
    'HandlerLock.object_type',
    variant,
    (context, value) =>
      handleHandlerLock(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Lock is not supported for object_type: CLAS/OC'),
      ],
      wrong: [
        'TRANSPORT',
        'Lock is not supported for object_type: TRANSPORT. Supported: CLASS',
      ],
    },
  ),
  ...family(
    'HandlerUnlock.object_type',
    variant,
    (context, value) =>
      handleHandlerUnlock(context, {
        object_type: value,
        object_name: 'ZA',
        lock_handle: 'LOCKHANDLE',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Unlock is not supported for object_type: CLAS/OC'),
      ],
      wrong: [
        'TRANSPORT',
        'Unlock is not supported for object_type: TRANSPORT. Supported: CLASS',
      ],
    },
  ),
  ...family(
    'HandlerValidate.object_type',
    variant,
    (context, value) =>
      handleHandlerValidate(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused('Validate is not supported for object_type: CLAS/OC'),
      ],
      wrong: [
        'TRANSPORT',
        'Validate is not supported for object_type: TRANSPORT. Supported: CLASS',
      ],
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
  ...family(
    'HandlerDeletionCheck.object_type',
    variant,
    (context, value) =>
      handleHandlerDeletionCheck(context, {
        object_type: value,
        object_name: 'ZA',
      }),
    {
      valid: 'CLASS',
      name: [
        'CLAS/OC',
        refused(
          'Unsupported deletion check for object_type: CLAS/OC. Supported:',
        ),
      ],
      wrong: [
        'TRANSPORT',
        'Unsupported deletion check for object_type: TRANSPORT. Supported:',
      ],
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
      .send({ connection })
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

  const on = (variant: ProjectionVariant) => {
    process.env.SAP_SYSTEM_TYPE = variant;
    const connection = recordingConnection();
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
      const [request] = connection.requests;
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
      expect(String(connection.requests[0]?.data)).toContain(
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
