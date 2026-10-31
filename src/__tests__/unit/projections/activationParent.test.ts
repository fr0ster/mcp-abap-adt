/**
 * Every activation code a tool offers is servable through its schema (#329,
 * S9 D1): `FUGR/FF` and `FUGR/I` (and the names standing for `FUGR/FF`) are
 * addressed under their function group, so each schema that offers them
 * declares the parent the boundary reads (`parentName`), described as
 * required for those codes. The arguments pass through the schema the server
 * registers (`jsonSchemaToZod`, which drops an undeclared property), then
 * the tool's own handler runs over a recording connection declared the
 * variant — real adt-clients code, no SAP.
 */
import { z } from 'zod';
import {
  TOOL_DEFINITION as HANDLER_ACTIVATE,
  handleHandlerActivate,
} from '../../../../compact-modify/src/handlers/handleHandlerActivate';
import {
  TOOL_DEFINITION as ACTIVATE_OBJECTS,
  handleActivateObjects,
} from '../../../handlers/common/high/handleActivateObjects';
import {
  TOOL_DEFINITION as ACTIVATE_OBJECT_LOW,
  handleActivateObject,
} from '../../../handlers/common/low/handleActivateObject';
import {
  ACTIVATION_CODES,
  ACTIVATION_NAMES,
  type ProjectionVariant,
  TYPE_NAMES,
} from '../../../lib/adtProjections';
import { parentedCodesOf } from '../../../lib/adtTypeCode';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { jsonSchemaToZod } from '../../../lib/handlers/utils/schemaUtils';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { recordingConnection } from '../../helpers/recordingConnection';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

/** A property of a JSON schema, as the definitions state it. */
interface Stated {
  readonly description?: string;
  readonly properties?: Readonly<Record<string, Stated>>;
  readonly items?: Stated;
}

type Handler = (context: HandlerContext, args: unknown) => Promise<unknown>;

/**
 * Each argument offering an activation type, the schema it is declared in,
 * where its parent sits in that schema, and how one object with a parent is
 * written as the tool's arguments.
 */
interface Offering {
  readonly argument: string;
  readonly inputSchema: (variant: ProjectionVariant) => Stated;
  readonly parentOf: (schema: Stated) => Stated | undefined;
  readonly args: (
    type: string,
    parentName: string | undefined,
  ) => Record<string, unknown>;
  readonly handler: Handler;
}

const inList = (schema: Stated) =>
  schema.properties?.objects?.items?.properties?.parentName;

const listArgs = (type: string, parentName: string | undefined) => ({
  objects: [
    {
      name: 'Z_MCP_PART',
      type,
      ...(parentName === undefined ? {} : { parentName }),
    },
  ],
});

const OFFERINGS: readonly Offering[] = [
  {
    argument: 'ActivateObjects.objects[]',
    inputSchema: (variant) => ACTIVATE_OBJECTS.variants[variant].inputSchema,
    parentOf: inList,
    args: listArgs,
    handler: handleActivateObjects,
  },
  {
    argument: 'ActivateObjectLow.objects[]',
    inputSchema: (variant) => ACTIVATE_OBJECT_LOW.variants[variant].inputSchema,
    parentOf: inList,
    args: listArgs,
    handler: (context, args) => handleActivateObject(context, parsedLow(args)),
  },
  {
    argument: 'HandlerActivate.objects[]',
    inputSchema: (variant) => HANDLER_ACTIVATE.variants[variant].inputSchema,
    parentOf: inList,
    args: listArgs,
    handler: (context, args) =>
      handleHandlerActivate(context, parsedCompact(args)),
  },
  {
    argument: 'HandlerActivate.object_adt_type',
    inputSchema: (variant) => HANDLER_ACTIVATE.variants[variant].inputSchema,
    parentOf: (schema) => schema.properties?.parentName,
    args: (type, parentName) => ({
      object_name: 'Z_MCP_PART',
      object_adt_type: type,
      ...(parentName === undefined ? {} : { parentName }),
    }),
    handler: (context, args) =>
      handleHandlerActivate(context, parsedCompact(args)),
  },
];

/** The objects the registered schema handed on, as ActivateObjectLow reads them. */
const objectList = z.array(
  z.object({
    name: z.string(),
    type: z.string(),
    parentName: z.string().optional(),
  }),
);

function parsedLow(args: unknown) {
  return z.object({ objects: objectList }).parse(args);
}

function parsedCompact(args: unknown) {
  return z
    .object({
      objects: objectList.optional(),
      object_name: z.string().optional(),
      object_adt_type: z.string().optional(),
      parentName: z.string().optional(),
    })
    .parse(args);
}

/** The codes of `variant`'s activation that need a parent, and the names standing for them. */
function parentedOn(variant: ProjectionVariant): string[] {
  const codes = parentedCodesOf(ACTIVATION_CODES[variant]);
  const names = ACTIVATION_NAMES[variant].filter((name) =>
    codes.some((code) => code === TYPE_NAMES[name]),
  );
  return [...codes, ...names];
}

async function call(
  offering: Offering,
  variant: ProjectionVariant,
  type: string,
  parentName: string | undefined,
) {
  process.env.SAP_SYSTEM_TYPE = variant;
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  // What the server hands the handler: the arguments through the schema it
  // registered for the tool on this variant.
  const shape = jsonSchemaToZod(offering.inputSchema(variant));
  const registered = z.object(shape).parse(offering.args(type, parentName));
  const answered = await offering
    .handler({ connection }, registered)
    .catch((thrown: unknown) => ({ thrown: String(thrown) }));
  return {
    urls: connection.requests.map((request) =>
      decodeURIComponent(
        `${request.url} ${typeof request.data === 'string' ? request.data : ''}`,
      ),
    ),
    answered: JSON.stringify(answered).replaceAll('\\"', '"'),
  };
}

describe('activation codes that need a parent are servable through the schema', () => {
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

  it.each(VARIANTS)('%s offers codes that need a parent', (variant) => {
    expect(parentedCodesOf(ACTIVATION_CODES[variant])).toEqual([
      'FUGR/FF',
      'FUGR/I',
    ]);
  });

  const schemas = VARIANTS.flatMap((variant) =>
    OFFERINGS.map(
      (offering) => [offering.argument, variant, offering] as const,
    ),
  );

  it.each(schemas)(
    '%s on %s declares parentName, required for every code and name needing it',
    (_argument, variant, offering) => {
      const parent = offering.parentOf(offering.inputSchema(variant));
      expect(parent).toBeDefined();
      for (const value of parentedOn(variant)) {
        expect(parent?.description).toContain(value);
      }
      expect(parent?.description).toContain('Required for');
    },
  );

  const cases = VARIANTS.flatMap((variant) =>
    OFFERINGS.flatMap((offering) =>
      parentedOn(variant)
        // `object_adt_type` takes a code; the names belong to the list forms.
        .filter(
          (value) =>
            offering.argument !== 'HandlerActivate.object_adt_type' ||
            value.includes('/'),
        )
        .map((value) => [offering.argument, variant, value, offering] as const),
    ),
  );

  it.each(cases)(
    '%s on %s, %s with parentName: sent under the group',
    async (_argument, variant, value, offering) => {
      const { urls } = await call(offering, variant, value, 'ZMCP_GRP');
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.join('\n')).toContain('/functions/groups/zmcp_grp/');
    },
  );

  it.each(cases)(
    '%s on %s, %s without parentName: refused naming it, nothing sent',
    async (_argument, variant, value, offering) => {
      const { urls, answered } = await call(
        offering,
        variant,
        value,
        undefined,
      );
      expect(urls).toEqual([]);
      expect(answered).toContain('objects[].parentName is required for');
    },
  );
});
