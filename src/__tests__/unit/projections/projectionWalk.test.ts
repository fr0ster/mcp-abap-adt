/**
 * Every value a tool is offered reaches a served path (#329, review focus 5).
 *
 * For each argument projected from the ADT type tables
 * (`PROJECTED_ARGUMENTS`, `src/lib/adtProjections.ts`), on each variant,
 * every value of its projection is sent through the tool's own handler over
 * a recording connection declared that variant — real adt-clients code, no
 * SAP — and must reach the client: at least one request is sent (a refusal
 * before the wire, an "unsupported type" branch, a variant refusal send
 * none), and, for an operation on the object itself, a request names the
 * collection the table gives the value's API (its address, in the URL, the
 * parameters or the body).
 *
 * The compact tools' arguments are read from their own descriptions on that
 * variant (`MEMBER(arg*, …)`): what the description promises is what is sent.
 */
import {
  ADT_TYPES_CLOUD,
  ADT_TYPES_ONPREM,
  type AdtApiName,
  type AdtApiTable,
} from '@mcp-abap-adt/interfaces-adt';
import { handleHandlerActivate } from '../../../../compact-modify/src/handlers/handleHandlerActivate';
import {
  TOOL_DEFINITION as HandlerCreate,
  handleHandlerCreate,
} from '../../../../compact-modify/src/handlers/handleHandlerCreate';
import {
  TOOL_DEFINITION as HandlerDelete,
  handleHandlerDelete,
} from '../../../../compact-modify/src/handlers/handleHandlerDelete';
import {
  TOOL_DEFINITION as HandlerLock,
  handleHandlerLock,
} from '../../../../compact-modify/src/handlers/handleHandlerLock';
import { handleHandlerProfileRun } from '../../../../compact-modify/src/handlers/handleHandlerProfileRun';
import { handleHandlerUnlock } from '../../../../compact-modify/src/handlers/handleHandlerUnlock';
import {
  TOOL_DEFINITION as HandlerUpdate,
  handleHandlerUpdate,
} from '../../../../compact-modify/src/handlers/handleHandlerUpdate';
import { handleHandlerCheckRun } from '../../../../compact-readonly-entries/src/handlers/handleHandlerCheckRun';
import { handleHandlerDeletionCheck } from '../../../../compact-readonly-entries/src/handlers/handleHandlerDeletionCheck';
import {
  TOOL_DEFINITION as HandlerGet,
  handleHandlerGet,
} from '../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import {
  TOOL_DEFINITION as HandlerValidate,
  handleHandlerValidate,
} from '../../../../compact-readonly-entries/src/handlers/handleHandlerValidate';
import { handleHandlerWhereUsed } from '../../../../compact-readonly-entries/src/handlers/handleHandlerWhereUsed';
import { handleActivateObjects } from '../../../handlers/common/high/handleActivateObjects';
import { handleGetObjectVersionDiff } from '../../../handlers/common/readonly/handleGetObjectVersionDiff';
import { handleGetObjectVersionSource } from '../../../handlers/common/readonly/handleGetObjectVersionSource';
import { handleGetObjectVersions } from '../../../handlers/common/readonly/handleGetObjectVersions';
import { handleGetIncludesList } from '../../../handlers/include/readonly/handleGetIncludesList';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import {
  ACTIVATION_CODES,
  ACTIVATION_NAMES,
  COMPACT_ACTIVATE,
  COMPACT_ACTIVATE_ROUTES,
  COMPACT_CHECK,
  COMPACT_CHECK_ROUTES,
  COMPACT_CREATE,
  COMPACT_CREATE_ROUTES,
  COMPACT_DELETE,
  COMPACT_DELETE_ROUTES,
  COMPACT_DELETION_CHECK,
  COMPACT_DELETION_CHECK_ROUTES,
  COMPACT_LOCK,
  COMPACT_LOCK_ROUTES,
  COMPACT_PROFILE,
  COMPACT_PROFILE_ROUTES,
  COMPACT_READ,
  COMPACT_READ_ROUTES,
  COMPACT_UNLOCK,
  COMPACT_UNLOCK_ROUTES,
  COMPACT_UPDATE,
  COMPACT_UPDATE_ROUTES,
  COMPACT_VALIDATE,
  COMPACT_VALIDATE_ROUTES,
  COMPACT_WHERE_USED,
  COMPACT_WHERE_USED_ROUTES,
  INCLUDES_PARENT_ROUTES,
  INCLUDES_PARENTS,
  PROJECTION_VARIANTS,
  type ProjectionVariant,
  SINGLE_ACTIVATION,
  SINGLE_ACTIVATION_ROUTES,
  TYPE_NAMES,
  type VariantValues,
  VERSIONED_KINDS,
  VERSIONED_ROUTES,
  WHERE_USED_CODES,
  WHERE_USED_NAMES,
} from '../../../lib/adtProjections';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { declareSystemKind } from '../../../lib/systemKind';
import { PROJECTED_ARGUMENTS } from '../../helpers/projectedArguments';
import {
  type RecordedRequest,
  recordingConnection,
} from '../../helpers/recordingConnection';

jest.setTimeout(60_000);

const TABLES: { readonly [V in ProjectionVariant]: AdtApiTable<string> } = {
  onprem: ADT_TYPES_ONPREM,
  cloud: ADT_TYPES_CLOUD,
};

/** The collection `variant`'s table gives `api`. */
function collectionOfApi(variant: ProjectionVariant, api: AdtApiName): string {
  const entry = TABLES[variant][api];
  if (entry === undefined) throw new Error(`${api} is not in the table`);
  return entry.collection;
}

/** The collection `variant`'s table gives `code` (its own, else its API's). */
function collectionOfCode(variant: ProjectionVariant, code: string): string {
  for (const entry of Object.values(TABLES[variant])) {
    if (entry === undefined) continue;
    const facts = Object.entries(entry.codes).find(([own]) => own === code);
    if (facts !== undefined) return facts[1].collection ?? entry.collection;
  }
  throw new Error(`${code} is not in the table`);
}

/** A route's API and operation, or a code (`undefined` operation). */
type Route = {
  readonly collection: (variant: ProjectionVariant) => string;
  /** Whether a request must name the collection (an operation on the object). */
  readonly addressed: boolean;
};

/** The operations whose requests carry no address of the object itself. */
const UNADDRESSED = new Set<string>([
  // A run, a profile and a unit-test result are asked by their own resources.
  'run',
  'profile',
  'unitTestResult',
  // A validation asks the collection's validation resource with the name.
  'validate',
]);

/**
 * The needs whose request is addressed to another resource: a service
 * binding's write is its publication job, a function group's includes are
 * read from its node structure (by its code, not its address).
 */
const UNADDRESSED_NEEDS = new Set<string>([
  'serviceBinding.update',
  'functionGroup.readMetadata',
]);

const needRoute = (need: {
  readonly api: AdtApiName;
  readonly operation: string;
}): Route => ({
  collection: (variant) => collectionOfApi(variant, need.api),
  addressed:
    !UNADDRESSED.has(need.operation) &&
    !UNADDRESSED_NEEDS.has(`${need.api}.${need.operation}`),
});

const codeRoute = (code: string): Route => ({
  collection: (variant) => collectionOfCode(variant, code),
  addressed: true,
});

const routesOf = (
  routes: Readonly<
    Record<string, { readonly api: AdtApiName; readonly operation: string }>
  >,
): ReadonlyMap<string, Route> =>
  new Map(
    Object.entries(routes).map(([name, need]) => [name, needRoute(need)]),
  );

const typeNameRoutes = new Map<string, Route>(
  Object.entries(TYPE_NAMES).map(([name, code]) => [name, codeRoute(code)]),
);

/**
 * The arguments a compact member takes, as `description` names them: the
 * starred names inside `MEMBER(…)`, up to its first alternative (`;`, `or`).
 * A name taken `as GROUP|MODULE` is given that way.
 */
function argumentsNamed(
  description: string,
  member: string,
): Array<readonly [string, string | undefined]> {
  const opening = `${member}(`;
  let start = description.indexOf(opening);
  while (start > 0 && /[A-Z_]/.test(description.charAt(start - 1))) {
    start = description.indexOf(opening, start + 1);
  }
  if (start < 0) throw new Error(`${member} is not named in the description`);
  const inner = description.slice(
    start + opening.length,
    description.indexOf(')', start),
  );
  const first = inner.split(';')[0].split(', or ')[0];
  return [...first.matchAll(/(\w+)\*( as GROUP\|MODULE)?/g)].map(
    (match) => [match[1], match[2] ? 'ZFG_A|Z_FM_A' : undefined] as const,
  );
}

/** A value for each argument a compact member may be given. */
const VALUES: Readonly<Record<string, string>> = {
  package_name: 'ZPKG_A',
  super_package: 'ZPKG_SUPER',
  description: 'A description',
  domain_name: 'ZDOM_A',
  data_element_name: 'ZDTEL_A',
  table_name: 'ZTAB_A',
  structure_name: 'ZSTRU_A',
  ddl_name: 'ZDDL_A',
  service_definition_name: 'ZSRVD_A',
  service_binding_name: 'ZSRVB_A',
  class_name: 'ZCL_A',
  program_name: 'ZPROG_A',
  interface_name: 'ZIF_A',
  function_group_name: 'ZFG_A',
  function_module_name: 'Z_FM_A',
  name: 'ZOBJ_A',
  implementation_type: 'Managed',
  root_entity: 'ZBDEF_A',
  behavior_definition_name: 'ZBDEF_A',
  behavior_implementation_name: 'ZBP_A',
  metadata_extension_name: 'ZDDLX_A',
  source_code: 'X',
  ddl_code: 'X',
  ddl_source: 'X',
  test_class_code: 'X',
  local_types_code: 'X',
  definitions_code: 'X',
  macros_code: 'X',
  test_class_source: 'X',
  implementation_code: 'X',
  desired_publication_state: 'published',
  binding_variant: 'ODATA_V4_UI',
  lock_handle: 'LOCKHANDLE',
  run_id: 'RUN0001',
  transport_number: 'XXXK900001',
  object_name: 'ZOBJ_A',
};

/** The arguments of one compact member, from its tool's description. */
function compactArguments(
  description: string,
  member: string,
): Record<string, string> {
  const args: Record<string, string> = {};
  for (const [name, given] of argumentsNamed(description, member)) {
    const value = given ?? VALUES[name];
    if (value === undefined) throw new Error(`no value for ${name}`);
    args[name] = value;
  }
  return args;
}

/** The types HandlerGet reads only the metadata of. */
const METADATA_ONLY = new Set<string>([
  'PACKAGE',
  'DOMAIN',
  'DATA_ELEMENT',
  'FUNCTION_GROUP',
]);

/** The object name a lifecycle tool takes: a function module's as GROUP|MODULE. */
const objectNameOf = (member: string): string =>
  member === 'FUNCTION_MODULE' ? 'ZFG_A|Z_FM_A' : 'ZOBJ_A';

/** One value of one walk: how it is sent, and where it must go. */
interface Step {
  readonly value: string;
  readonly send: (context: HandlerContext) => Promise<unknown>;
  readonly route: Route;
}

/** How the walk sends each value of one projected argument. */
interface Walk {
  readonly values: (variant: ProjectionVariant) => readonly string[];
  readonly steps: (variant: ProjectionVariant) => readonly Step[];
}

/**
 * A walk over `values` (a projection, typed), each sent by `send` and routed
 * by `routes`.
 */
function walk<M extends string>(spec: {
  readonly values: VariantValues<M, M>;
  readonly send: (
    context: HandlerContext,
    value: M,
    variant: ProjectionVariant,
  ) => Promise<unknown>;
  readonly routes: ReadonlyMap<string, Route>;
}): Walk {
  return {
    values: (variant) => spec.values[variant],
    steps: (variant) =>
      spec.values[variant].map((value) => {
        const route = spec.routes.get(value);
        if (route === undefined) throw new Error(`no route for ${value}`);
        return {
          value,
          send: (context) => spec.send(context, value, variant),
          route,
        };
      }),
  };
}

/** The description a compact tool states on `variant`. */
const stated = (
  definition: {
    readonly variants: {
      readonly [V in ProjectionVariant]: { readonly description: string };
    };
  },
  variant: ProjectionVariant,
) => definition.variants[variant].description;

const versionContent = (kind: string, variant: ProjectionVariant) => {
  const route = Object.entries(VERSIONED_ROUTES).find(
    ([name]) => name === kind,
  );
  if (route === undefined) throw new Error(`${kind} has no route`);
  return `${collectionOfApi(variant, route[1].api)}/zobj_a/source/main/versions/00001/content`;
};

const codeRoutes = (codes: readonly string[]) =>
  new Map(codes.map((code): [string, Route] => [code, codeRoute(code)]));

const WALKS: Readonly<Record<string, Walk>> = {
  'HandlerCreate.object_type': walk({
    values: COMPACT_CREATE,
    send: (context, value, variant) =>
      handleHandlerCreate(context, {
        ...compactArguments(stated(HandlerCreate, variant), value),
        object_type: value,
      }),
    routes: routesOf(COMPACT_CREATE_ROUTES),
  }),
  'HandlerGet.object_type': walk({
    values: COMPACT_READ,
    send: (context, value, variant) =>
      handleHandlerGet(context, {
        ...compactArguments(stated(HandlerGet, variant), value),
        // The types whose one part is their metadata (the description's
        // "Parts per type").
        ...(METADATA_ONLY.has(value) ? { part: 'metadata' } : {}),
        object_type: value,
      }),
    routes: routesOf(COMPACT_READ_ROUTES),
  }),
  'HandlerUpdate.object_type': walk({
    values: COMPACT_UPDATE,
    send: (context, value, variant) =>
      handleHandlerUpdate(context, {
        ...compactArguments(stated(HandlerUpdate, variant), value),
        lock_handle: 'LOCKHANDLE',
        object_type: value,
      }),
    routes: routesOf(COMPACT_UPDATE_ROUTES),
  }),
  'HandlerDelete.object_type': walk({
    values: COMPACT_DELETE,
    send: (context, value, variant) =>
      handleHandlerDelete(context, {
        ...compactArguments(stated(HandlerDelete, variant), value),
        object_type: value,
      }),
    routes: routesOf(COMPACT_DELETE_ROUTES),
  }),
  'HandlerActivate.object_type': walk({
    values: COMPACT_ACTIVATE,
    // A function module is named under its group, as the description says.
    send: (context, value) =>
      handleHandlerActivate(context, {
        object_type: value,
        object_name: objectNameOf(value),
      }),
    routes: new Map(
      Object.entries(COMPACT_ACTIVATE_ROUTES).map(
        ([name, code]): [string, Route] => [name, codeRoute(code)],
      ),
    ),
  }),
  'HandlerLock.object_type': walk({
    values: COMPACT_LOCK,
    send: (context, value, variant) =>
      handleHandlerLock(context, {
        ...compactArguments(stated(HandlerLock, variant), value),
        object_type: value,
        object_name: objectNameOf(value),
      }),
    routes: routesOf(COMPACT_LOCK_ROUTES),
  }),
  'HandlerUnlock.object_type': walk({
    values: COMPACT_UNLOCK,
    send: (context, value) =>
      handleHandlerUnlock(context, {
        object_type: value,
        object_name: objectNameOf(value),
        lock_handle: 'LOCKHANDLE',
      }),
    routes: routesOf(COMPACT_UNLOCK_ROUTES),
  }),
  'HandlerValidate.object_type': walk({
    values: COMPACT_VALIDATE,
    send: (context, value, variant) =>
      handleHandlerValidate(context, {
        ...compactArguments(stated(HandlerValidate, variant), value),
        object_type: value,
        object_name: objectNameOf(value),
      }),
    routes: routesOf(COMPACT_VALIDATE_ROUTES),
  }),
  'HandlerCheckRun.object_type': walk({
    values: COMPACT_CHECK,
    send: (context, value) =>
      handleHandlerCheckRun(context, {
        object_type: value,
        object_name: objectNameOf(value),
      }),
    routes: routesOf(COMPACT_CHECK_ROUTES),
  }),
  'HandlerDeletionCheck.object_type': walk({
    values: COMPACT_DELETION_CHECK,
    send: (context, value) =>
      handleHandlerDeletionCheck(context, {
        object_type: value,
        object_name: objectNameOf(value),
      }),
    routes: routesOf(COMPACT_DELETION_CHECK_ROUTES),
  }),
  'HandlerProfileRun.target_type': walk({
    values: COMPACT_PROFILE,
    send: (context, value) =>
      handleHandlerProfileRun(context, {
        target_type: value,
        class_name: 'ZCL_A',
        program_name: 'ZPROG_A',
      }),
    routes: routesOf(COMPACT_PROFILE_ROUTES),
  }),
  'HandlerWhereUsed.object_type': walk({
    values: COMPACT_WHERE_USED,
    send: (context, value) =>
      handleHandlerWhereUsed(context, {
        object_type: value,
        object_name: 'ZOBJ_A',
        function_group_name: 'ZFG_A',
      }),
    routes: new Map(
      Object.entries(COMPACT_WHERE_USED_ROUTES).map(
        ([name, alias]): [string, Route] => [
          name,
          codeRoute(TYPE_NAMES[alias]),
        ],
      ),
    ),
  }),
  'GetWhereUsed.object_type': walk({
    values: {
      onprem: [...WHERE_USED_CODES.onprem, ...WHERE_USED_NAMES.onprem],
      cloud: [...WHERE_USED_CODES.cloud, ...WHERE_USED_NAMES.cloud],
    },
    send: (context, value) =>
      handleGetWhereUsed(context, {
        object_type: value,
        object_name:
          value === 'FUGR/FF' ||
          value === 'functionmodule' ||
          value === 'function_module' ||
          value === 'function' ||
          value === 'func'
            ? 'ZFG_A|Z_FM_A'
            : 'ZOBJ_A',
      }),
    routes: new Map([
      ...typeNameRoutes,
      ...codeRoutes(WHERE_USED_CODES.onprem),
    ]),
  }),
  'ActivateObjects.objects[].type': walk({
    values: {
      onprem: [...ACTIVATION_CODES.onprem, ...ACTIVATION_NAMES.onprem],
      cloud: [...ACTIVATION_CODES.cloud, ...ACTIVATION_NAMES.cloud],
    },
    // Two objects: a group activation, whatever the type.
    send: (context, value) =>
      handleActivateObjects(context, {
        objects: [
          { name: 'ZOBJ_A', type: value, parentName: 'ZFG_A' },
          { name: 'ZOBJ_B', type: value, parentName: 'ZFG_A' },
        ],
      }),
    routes: new Map([
      ...typeNameRoutes,
      ...codeRoutes(ACTIVATION_CODES.onprem),
    ]),
  }),
  'ActivateObjects.preaudit': walk({
    values: SINGLE_ACTIVATION,
    // One object: its own type's activation.
    send: (context, value) =>
      handleActivateObjects(context, {
        objects: [{ name: 'ZOBJ_A', type: value }],
      }),
    routes: routesOf(SINGLE_ACTIVATION_ROUTES),
  }),
  'GetIncludesList.object_type': walk({
    values: INCLUDES_PARENTS,
    send: (context, value) =>
      handleGetIncludesList(context, {
        object_type: value,
        object_name: 'ZOBJ_A',
      }),
    routes: routesOf(INCLUDES_PARENT_ROUTES),
  }),
  'GetIncludesList.objects[].object_type': walk({
    values: INCLUDES_PARENTS,
    send: (context, value) =>
      handleGetIncludesList(context, {
        objects: [{ object_type: value, object_name: 'ZOBJ_A' }],
      }),
    routes: routesOf(INCLUDES_PARENT_ROUTES),
  }),
  'GetObjectVersions.object_type': walk({
    values: VERSIONED_KINDS,
    send: (context, value) =>
      handleGetObjectVersions(context, {
        object_type: value,
        object_name: 'ZOBJ_A',
        function_group_name: 'ZFG_A',
      }),
    routes: routesOf(VERSIONED_ROUTES),
  }),
  'GetObjectVersionSource.object_type': walk({
    values: VERSIONED_KINDS,
    send: (context, value, variant) =>
      handleGetObjectVersionSource(context, {
        object_type: value,
        content_uri: versionContent(value, variant),
      }),
    routes: routesOf(VERSIONED_ROUTES),
  }),
  'GetObjectVersionDiff.object_type': walk({
    values: VERSIONED_KINDS,
    send: (context, value, variant) =>
      handleGetObjectVersionDiff(context, {
        object_type: value,
        content_uri_from: versionContent(value, variant),
        content_uri_to: versionContent(value, variant),
      }),
    routes: routesOf(VERSIONED_ROUTES),
  }),
};

/** Whether `request` names `collection`: in its URL, parameters or body. */
function names(request: RecordedRequest, collection: string): boolean {
  const lower = collection.toLowerCase();
  const text = [
    request.url,
    JSON.stringify(request.params ?? ''),
    typeof request.data === 'string'
      ? request.data
      : JSON.stringify(request.data ?? ''),
  ]
    .join(' ')
    .toLowerCase();
  return text.includes(lower) || safeDecode(text).includes(lower);
}

/** `text` with its percent-encoding read, or as it is where it has none. */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** What the handler answered, as text, for a failing case's message. */
function textOf(answered: unknown): string {
  try {
    return JSON.stringify(answered)?.slice(0, 400) ?? String(answered);
  } catch {
    return String(answered);
  }
}

const cases = Object.entries(WALKS).flatMap(([key, each]) =>
  PROJECTION_VARIANTS.flatMap((variant) =>
    each.steps(variant).map((step) => [key, variant, step] as const),
  ),
);

describe('every projected value reaches a served path', () => {
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

  it('walks every projected argument, each with the values the tools are given', () => {
    for (const projected of PROJECTED_ARGUMENTS) {
      const key = `${projected.tool}.${projected.argument}`;
      const each = WALKS[key];
      expect({ key, walked: each !== undefined }).toEqual({
        key,
        walked: true,
      });
      for (const variant of PROJECTION_VARIANTS) {
        expect({ key, variant, values: each?.values(variant) }).toEqual({
          key,
          variant,
          values: projected.values[variant],
        });
      }
    }
    expect(Object.keys(WALKS).length).toBe(PROJECTED_ARGUMENTS.length);
    expect(cases.length).toBeGreaterThan(400);
  });

  it.each(
    cases.map(([key, variant, step]) => [key, variant, step.value, step]),
  )('%s on %s: %s', async (key, variant, value, step) => {
    const route = step.route;
    process.env.SAP_SYSTEM_TYPE = variant;
    const connection = recordingConnection();
    declareSystemKind(connection, variant);
    const context: HandlerContext = { connection };
    const answered = await step
      .send(context)
      .catch((thrown: unknown) => ({ thrown: String(thrown) }));
    const sent = connection.requests;
    if (sent.length === 0) {
      throw new Error(
        `${key} ${value} on ${variant} sent nothing: ${textOf(answered)}`,
      );
    }
    if (route.addressed) {
      const collection = route.collection(variant);
      if (!sent.some((request) => names(request, collection))) {
        throw new Error(
          `${key} ${value} on ${variant} named no ${collection}: ${sent
            .map((request) => `${request.method} ${request.url}`)
            .join('; ')}`,
        );
      }
    }
  });
});
