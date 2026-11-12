/**
 * The arguments a compact tool needs for one object type beyond its name
 * (#329, S6): each is named in the tool's description for that type, a call
 * without it is refused naming it before anything is sent, and a call with
 * it reaches the client.
 *
 * Each case runs the tool's own handler over a recording connection declared
 * the variant — real adt-clients code, no SAP.
 */

import {
  TOOL_DEFINITION as HandlerLock,
  handleHandlerLock,
} from '../../../compact-modify/src/handlers/handleHandlerLock';
import {
  TOOL_DEFINITION as HandlerCheckRun,
  handleHandlerCheckRun,
} from '../../../compact-readonly-entries/src/handlers/handleHandlerCheckRun';
import {
  TOOL_DEFINITION as HandlerValidate,
  handleHandlerValidate,
} from '../../../compact-readonly-entries/src/handlers/handleHandlerValidate';
import {
  handleValidateServiceBinding,
  TOOL_DEFINITION as ValidateServiceBinding,
} from '../../handlers/service_binding/high/handleValidateServiceBinding';
import type { ProjectionVariant } from '../../lib/adtProjections';
import { defineTool, type HandlerContext } from '../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { holding } from '../helpers/heldLocks';
import { listedJson } from '../helpers/listedJson';
import { recordingConnection } from '../helpers/recordingConnection';

jest.setTimeout(60_000);

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

/** One object type of one tool, and the arguments it needs. */
interface Need {
  readonly tool: 'HandlerLock' | 'HandlerValidate';
  readonly objectType: string;
  /** The arguments the type needs, each with a value. */
  readonly needed: Readonly<Record<string, string>>;
  /** What else the call carries. */
  readonly rest: Readonly<Record<string, string>>;
  /** The token the description names the type and its arguments by. */
  readonly token: string;
  /** The refusal of a call without `missing`, the others given. */
  readonly refusal: (missing: string) => string;
  /** The variants that offer the type; both when absent. */
  readonly variants?: readonly ProjectionVariant[];
}

const NEEDS: readonly Need[] = [
  {
    tool: 'HandlerLock',
    objectType: 'PACKAGE',
    needed: { super_package: 'ZPKG_SUPER' },
    rest: { object_name: 'ZPKG_A' },
    token: 'PACKAGE(object_name*, super_package*)',
    refusal: () => 'super_package is required for package locking.',
  },
  {
    tool: 'HandlerValidate',
    objectType: 'BEHAVIOR_DEFINITION',
    needed: {
      package_name: 'ZPKG_A',
      description: 'A description',
      root_entity: 'ZI_ROOT_A',
      implementation_type: 'Managed',
    },
    rest: { object_name: 'ZBDEF_A' },
    token:
      'BEHAVIOR_DEFINITION(object_name*, package_name*, description*, root_entity*, implementation_type*)',
    refusal: (missing) =>
      `Behavior definition validation requires package_name, description, root_entity and implementation_type; missing: ${missing}`,
  },
  {
    tool: 'HandlerValidate',
    objectType: 'BEHAVIOR_IMPLEMENTATION',
    needed: { package_name: 'ZPKG_A' },
    rest: { object_name: 'ZBP_A', behavior_definition: 'ZBDEF_A' },
    token:
      'BEHAVIOR_IMPLEMENTATION(object_name*, package_name*, behavior_definition)',
    refusal: () => 'Behavior implementation validation requires package_name',
  },
  {
    tool: 'HandlerValidate',
    objectType: 'METADATA_EXTENSION',
    needed: { description: 'A description', package_name: 'ZPKG_A' },
    rest: { object_name: 'ZDDLX_A' },
    token: 'METADATA_EXTENSION(object_name*, description*, package_name*)',
    refusal: (missing) =>
      `Metadata extension validation requires description and package_name; missing: ${missing}`,
  },
  {
    tool: 'HandlerValidate',
    objectType: 'PROGRAM',
    needed: { package_name: 'ZPKG_A' },
    rest: { object_name: 'ZPROG_A' },
    token: 'PROGRAM(object_name*, package_name*)',
    refusal: (missing) =>
      `Program validation requires package_name; missing: ${missing}`,
    variants: ['onprem'],
  },
  {
    tool: 'HandlerValidate',
    objectType: 'INCLUDE',
    needed: { package_name: 'ZPKG_A' },
    rest: { object_name: 'ZINCL_A' },
    token: 'INCLUDE(object_name*, package_name*)',
    refusal: (missing) =>
      `Include validation requires package_name; missing: ${missing}`,
    variants: ['onprem'],
  },
  {
    tool: 'HandlerValidate',
    objectType: 'SERVICE_BINDING',
    needed: { package_name: 'ZPKG_A' },
    rest: { object_name: 'ZSRVB_A', service_definition_name: 'ZSRVD_A' },
    token:
      'SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*, package_name*)',
    refusal: () => 'package_name is required',
  },
];

/** Each tool's entry: the model's call, parsed with the tool's schema first. */
const TOOLS = {
  HandlerLock: {
    definition: HandlerLock,
    send: (context: HandlerContext, args: Record<string, string>) =>
      defineTool(HandlerLock, handleHandlerLock).call(context, args),
  },
  HandlerValidate: {
    definition: HandlerValidate,
    send: (context: HandlerContext, args: Record<string, string>) =>
      defineTool(HandlerValidate, handleHandlerValidate).call(context, args),
  },
} as const;

/** What the handler answered, thrown or returned, as text. */
function textOf(answered: unknown): string {
  return JSON.stringify(answered) ?? String(answered);
}

/** The requests one call issues on `variant`, and its answer. */
async function call(
  need: Need,
  variant: ProjectionVariant,
  args: Record<string, string>,
): Promise<{ requests: number; answered: string }> {
  process.env.SAP_SYSTEM_TYPE = variant;
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  const answered = await TOOLS[need.tool]
    .send(
      { connection, heldLocks: holding() },
      { object_type: need.objectType, ...args },
    )
    .catch((thrown: unknown) => ({ thrown: String(thrown) }));
  return { requests: connection.requests.length, answered: textOf(answered) };
}

describe('the arguments a compact tool needs for one object type', () => {
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

  const offeredOn = (variant: ProjectionVariant) =>
    NEEDS.filter((need) => (need.variants ?? VARIANTS).includes(variant));

  const cases = VARIANTS.flatMap((variant) =>
    offeredOn(variant).map(
      (need) => [need.tool, need.objectType, variant, need] as const,
    ),
  );

  it.each(cases)(
    '%s %s on %s: the description names the arguments',
    (_tool, _type, variant, need) => {
      expect(
        TOOLS[need.tool].definition.variants[variant].description,
      ).toContain(need.token);
    },
  );

  it.each(cases)(
    '%s %s on %s: with its arguments the call reaches the client',
    async (_tool, _type, variant, need) => {
      const { requests } = await call(need, variant, {
        ...need.rest,
        ...need.needed,
      });
      expect(requests).toBeGreaterThan(0);
    },
  );

  const missing = VARIANTS.flatMap((variant) =>
    offeredOn(variant).flatMap((need) =>
      Object.keys(need.needed).map(
        (argument) =>
          [need.tool, need.objectType, argument, variant, need] as const,
      ),
    ),
  );

  it.each(missing)(
    '%s %s without %s on %s: refused naming it, nothing sent',
    async (_tool, _type, argument, variant, need) => {
      const given = Object.fromEntries(
        Object.entries(need.needed).filter(([name]) => name !== argument),
      );
      for (const absent of [given, { ...given, [argument]: '' }]) {
        const { requests, answered } = await call(need, variant, {
          ...need.rest,
          ...absent,
        });
        expect(answered).toContain(need.refusal(argument));
        expect(answered).toContain('"isError":true');
        expect(requests).toBe(0);
      }
    },
  );
});

/**
 * The table type's validation and check: one request each, on both variants,
 * named in the descriptions.
 */
describe('HandlerValidate and HandlerCheckRun take a table type', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;

  afterEach(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  it.each(VARIANTS)('on %s: one validation request', async (variant) => {
    process.env.SAP_SYSTEM_TYPE = variant;
    const connection = recordingConnection();
    declareSystemKind(connection, variant);
    expect(HandlerValidate.variants[variant].description).toContain(
      'TABLE_TYPE(object_name*, description)',
    );
    await handleHandlerValidate(
      { connection },
      { object_type: 'TABLE_TYPE', object_name: 'ZTTYP_A' },
    );
    expect(connection.requests).toHaveLength(1);
    expect(JSON.stringify(connection.requests[0]).toLowerCase()).toContain(
      'tabletype',
    );
  });

  it.each(VARIANTS)('on %s: one check request', async (variant) => {
    process.env.SAP_SYSTEM_TYPE = variant;
    const connection = recordingConnection();
    declareSystemKind(connection, variant);
    expect(HandlerCheckRun.variants[variant].description).toContain(
      'TABLE_TYPE(object_name*)',
    );
    await handleHandlerCheckRun(
      { connection },
      { object_type: 'TABLE_TYPE', object_name: 'ZTTYP_A' },
    );
    expect(connection.requests).toHaveLength(1);
    expect(JSON.stringify(connection.requests[0]).toLowerCase()).toContain(
      '/sap/bc/adt/ddic/tabletypes/zttyp_a',
    );
  });
});

/**
 * ValidateServiceBinding, the full tool the compact SERVICE_BINDING
 * validation serves: its schema requires `package_name` (the next major), and
 * a call without it is refused naming it, nothing sent.
 */
describe('ValidateServiceBinding requires package_name', () => {
  it('the schema requires it', () => {
    expect(listedJson(ValidateServiceBinding.inputSchema).required).toContain(
      'package_name',
    );
  });

  it.each([{}, { package_name: '' }, { package_name: '  ' }])(
    'a call with %j is refused naming it, nothing sent',
    async (absent) => {
      const connection = recordingConnection();
      declareSystemKind(connection, 'onprem');
      const answered = await handleValidateServiceBinding(
        { connection },
        {
          service_binding_name: 'ZSRVB_A',
          service_definition_name: 'ZSRVD_A',
          ...absent,
        },
      );
      expect(textOf(answered)).toContain('package_name is required');
      expect(answered.isError).toBe(true);
      expect(connection.requests).toEqual([]);
    },
  );

  it('a call with it reaches the client', async () => {
    const connection = recordingConnection();
    declareSystemKind(connection, 'onprem');
    await handleValidateServiceBinding(
      { connection },
      {
        service_binding_name: 'ZSRVB_A',
        service_definition_name: 'ZSRVD_A',
        package_name: 'ZPKG_A',
      },
    );
    expect(connection.requests.length).toBeGreaterThan(0);
  });
});

/**
 * HandlerValidate's SERVICE_BINDING branch hands its arguments to
 * ValidateServiceBinding's handler, which refuses a missing one in a fixed
 * order: the binding's name, the service definition, the package. Through the
 * tool's entry, as the model's call: each refusal names its argument, in that
 * order, and nothing is sent.
 */
describe('HandlerValidate SERVICE_BINDING: the callee’s refusals, in its order', () => {
  const cases: ReadonlyArray<
    readonly [string, Readonly<Record<string, string>>, string]
  > = [
    [
      'object_name empty',
      { object_name: '' },
      'service_binding_name is required',
    ],
    [
      'object_name empty, the definition given',
      { object_name: '', service_definition_name: 'ZSRVD_A' },
      'service_binding_name is required',
    ],
    [
      'service_definition_name absent',
      { object_name: 'ZSRVB_A', package_name: 'ZPKG_A' },
      'service_definition_name is required',
    ],
    [
      'service_definition_name empty',
      {
        object_name: 'ZSRVB_A',
        service_definition_name: '',
        package_name: 'ZPKG_A',
      },
      'service_definition_name is required',
    ],
    [
      'package_name absent',
      { object_name: 'ZSRVB_A', service_definition_name: 'ZSRVD_A' },
      'package_name is required',
    ],
    [
      'package_name empty',
      {
        object_name: 'ZSRVB_A',
        service_definition_name: 'ZSRVD_A',
        package_name: '',
      },
      'package_name is required',
    ],
    [
      'package_name blank',
      {
        object_name: 'ZSRVB_A',
        service_definition_name: 'ZSRVD_A',
        package_name: '  ',
      },
      'package_name is required',
    ],
    [
      'the definition and the package both absent',
      { object_name: 'ZSRVB_A' },
      'service_definition_name is required',
    ],
  ];

  it.each(cases)('%s: refused, nothing sent', async (_case, given, words) => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    const connection = recordingConnection();
    declareSystemKind(connection, 'onprem');
    const answered = await defineTool(
      HandlerValidate,
      handleHandlerValidate,
    ).call({ connection }, { object_type: 'SERVICE_BINDING', ...given });
    expect(textOf(answered)).toContain(words);
    expect(textOf(answered)).toContain('"isError":true');
    expect(connection.requests).toEqual([]);
  });
});
