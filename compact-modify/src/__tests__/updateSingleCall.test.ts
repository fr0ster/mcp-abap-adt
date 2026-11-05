/**
 * Compact `HandlerUpdate` is one ADT request: the write of the type under the
 * caller's `lock_handle`, for every type but a function module — no lock,
 * unlock, check, activation, no read before the write and none after it. A
 * function module's metadata is read first, at the group given, and the
 * write is sent only when that group holds it (#2: SAP ignores the group of
 * a module's address) (spec §4.6, the owner's rule:
 * compact is one request per tool call, the consumer chains HandlerLock →
 * HandlerUpdate → HandlerUnlock → HandlerActivate). There is no flag and no mode.
 *
 * Real adt-clients code runs over a recording connection; nothing of it is
 * doubled. Pinned per type:
 *
 * - exactly one request, the write, held open or answered (an empty `200`,
 *   a `404`) alike, carrying the given lock handle and the transport request;
 * - PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP: the body is `source_code`
 *   byte for byte — no read of the document first;
 * - without `lock_handle`, refused before any request;
 * - the schema names `lock_handle` required, and no argument the write does
 *   not carry;
 * - HandlerLock and HandlerUnlock take SERVICE_DEFINITION and SERVICE_BINDING,
 *   one request each.
 */
import {
  compactLockSchema,
  compactUnlockSchema,
  compactUpdateSchema,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { HeldLocks } from '@mcp-abap-adt/lib/state';
import { moduleMetadataDocument } from '../../../src/__tests__/helpers/functionModuleMetadata';
import { holding } from '../../../src/__tests__/helpers/heldLocks';
import {
  declaredRequired,
  jsonAt,
  listedJson,
} from '../../../src/__tests__/helpers/listedJson';
import { LOCK_SUCCESS_XML } from '../../../src/__tests__/helpers/recordingConnection';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../src/lib/systemContext';
import { compactWriteRouterMap } from '../handlers/compactWriteRoutes';
import {
  TOOL_DEFINITION as HandlerLock,
  handleHandlerLock,
} from '../handlers/handleHandlerLock';
import {
  TOOL_DEFINITION as HandlerUnlock,
  handleHandlerUnlock,
} from '../handlers/handleHandlerUnlock';
import {
  handleHandlerUpdate,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerUpdate';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

type Sent = { method: string; url: string; data?: unknown; params?: unknown };
type Mode = 'pending' | 'answered' | 'not-found' | 'forbidden';
type Answer = { isError?: boolean; content?: Array<{ text?: string }> };

const LOCK = 'LOCK_HANDLE_PLACEHOLDER';
const TRANSPORT = 'XXXK900001';

/** A connection that records every request and answers per `mode`. */
function recording(mode: Mode) {
  const sent: Sent[] = [];
  const connection = {
    async connect() {},
    async getBaseUrl() {
      return 'https://example.com';
    },
    getSessionId() {
      return null;
    },
    setSessionType() {},
    async makeAdtRequest(options: Sent) {
      sent.push({
        method: options.method,
        url: String(options.url),
        data: options.data,
        params: options.params,
      });
      if (mode === 'pending') return new Promise<never>(() => {});
      if (mode === 'not-found') {
        return { status: 404, statusText: 'Not Found', headers: {}, data: '' };
      }
      if (mode === 'forbidden') {
        return { status: 403, statusText: 'Forbidden', headers: {}, data: '' };
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: String(options.url).includes('_action=LOCK')
          ? LOCK_SUCCESS_XML
          : String(options.url) === MODULE_METADATA
            ? moduleMetadataDocument('Z_FM_A', 'ZFG_A')
            : '',
      };
    },
  };
  return { connection, sent };
}

/** The function module's metadata read, at its group (#2). */
const MODULE_METADATA =
  '/sap/bc/adt/functions/groups/zfg_a/fmodules/z_fm_a?version=workingArea';

/** Every type but the function module, whose group is checked first (#2). */
const notModule = ([type]: readonly [string, unknown]) =>
  type !== 'FUNCTION_MODULE';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

// The instance locked what the cases write under: its owner holds the handle.
const contextOver = (connection: unknown) =>
  ({
    connection,
    logger: silent,
    heldLocks: holding(LOCK),
  }) as unknown as HandlerContext;

/** Lets every queued callback and immediate run, so a held handler sends all it can. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

type Run = { sent: Sent[]; answer?: Answer };

async function run(
  mode: Mode,
  call: (context: HandlerContext) => Promise<unknown>,
): Promise<Run> {
  const { connection, sent } = recording(mode);
  const pending = call(contextOver(connection)) as Promise<Answer>;
  if (mode === 'pending') {
    pending.catch(() => undefined);
    await settle();
    return { sent: [...sent] };
  }
  const answer = await pending.catch((thrown: unknown) => ({
    isError: true,
    content: [{ text: String(thrown) }],
  }));
  return { sent, answer };
}

const textOf = (answer?: Answer) => answer?.content?.[0]?.text ?? '';

/** A metadata document as `HandlerGet` part `metadata` answers it, changed by the caller. */
const DOCUMENT = (root: string) =>
  `<?xml version="1.0" encoding="utf-8"?><${root} xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="Z_A" adtcore:description="Changed  text &amp; more">\n  <keep untouched="yes"/>\n</${root}>`;

/** The types whose write is their metadata document: `source_code` sent byte for byte. */
const DOCUMENTS: Array<[string, Record<string, unknown>]> = [
  ['PACKAGE', { package_name: 'ZPKG_A', source_code: DOCUMENT('pak:package') }],
  ['DOMAIN', { domain_name: 'ZDOM_A', source_code: DOCUMENT('doma:domain') }],
  [
    'DATA_ELEMENT',
    {
      data_element_name: 'ZDTEL_A',
      source_code: DOCUMENT('blue:wbobj'),
    },
  ],
  [
    'FUNCTION_GROUP',
    {
      function_group_name: 'ZFG_A',
      source_code: DOCUMENT('group:abapFunctionGroup'),
    },
  ],
  [
    'TABLE_TYPE',
    { table_type_name: 'ZTTYP_A', source_code: DOCUMENT('ttyp:tableType') },
  ],
  [
    'INCLUDE',
    {
      include_name: 'ZINCL_A',
      part: 'metadata',
      source_code: DOCUMENT('include:abapInclude'),
    },
  ],
];

const SOURCES: Array<[string, Record<string, unknown>]> = [
  ['TABLE', { table_name: 'ZTAB_A', ddl_code: 'source text' }],
  ['STRUCTURE', { structure_name: 'ZSTRU_A', ddl_code: 'source text' }],
  ['DDL', { ddl_name: 'ZDDL_A', ddl_source: 'source text' }],
  [
    'SERVICE_DEFINITION',
    { service_definition_name: 'ZSRVD_A', source_code: 'source text' },
  ],
  ['CLASS', { class_name: 'ZCL_A', source_code: 'source text' }],
  ['LOCAL_TEST_CLASS', { class_name: 'ZCL_A', test_class_code: 'source text' }],
  ['LOCAL_TYPES', { class_name: 'ZCL_A', local_types_code: 'source text' }],
  [
    'LOCAL_DEFINITIONS',
    { class_name: 'ZCL_A', definitions_code: 'source text' },
  ],
  ['LOCAL_MACROS', { class_name: 'ZCL_A', macros_code: 'source text' }],
  ['UNIT_TEST', { class_name: 'ZCL_A', test_class_source: 'source text' }],
  ['CDS_UNIT_TEST', { class_name: 'ZCL_T', test_class_source: 'source text' }],
  ['PROGRAM', { program_name: 'ZPROG_A', source_code: 'source text' }],
  ['INCLUDE', { include_name: 'ZINCL_A', source_code: 'source text' }],
  ['INTERFACE', { interface_name: 'ZIF_A', source_code: 'source text' }],
  [
    'FUNCTION_MODULE',
    {
      function_module_name: 'Z_FM_A',
      function_group_name: 'ZFG_A',
      source_code: 'source text',
    },
  ],
  ['BEHAVIOR_DEFINITION', { name: 'ZBDEF_A', source_code: 'source text' }],
  [
    'BEHAVIOR_IMPLEMENTATION',
    { class_name: 'ZBP_A', implementation_code: 'source text' },
  ],
  ['METADATA_EXTENSION', { name: 'ZDDLX_A', source_code: 'source text' }],
];

/** The service binding's write is its publication request. */
const PUBLICATIONS: Array<[string, Record<string, unknown>]> = [
  [
    'SERVICE_BINDING',
    {
      service_binding_name: 'ZSRVB_A',
      desired_publication_state: 'published',
      binding_variant: 'ODATA_V4_UI',
    },
  ],
  [
    'SERVICE_BINDING',
    {
      service_binding_name: 'ZSRVB_A',
      desired_publication_state: 'unpublished',
      binding_variant: 'ODATA_V2_UI',
      service_name: 'ZSRV_A',
    },
  ],
];

const TYPES = [...DOCUMENTS, ...SOURCES, ...PUBLICATIONS];

const update =
  (object_type: string, fields: Record<string, unknown>) =>
  (context: HandlerContext) =>
    handleHandlerUpdate(context, { object_type, ...fields } as never);

const underLock = (fields: Record<string, unknown>) => ({
  ...fields,
  lock_handle: LOCK,
  transport_request: TRANSPORT,
});

const withSystemContext = () => {
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());
};

describe('HandlerUpdate is one write under lock_handle', () => {
  withSystemContext();

  it('covers every type of the update route', () => {
    const withUpdate = Object.entries(compactWriteRouterMap)
      .filter(([, routes]) => routes.update !== undefined)
      .map(([type]) => type)
      .sort();
    expect(withUpdate).toEqual([...new Set(TYPES.map(([t]) => t))].sort());
  });

  it.each(TYPES.filter(notModule))(
    '%s: exactly one request, under the given lock_handle, the same held, answered or 404',
    async (objectType, fields) => {
      const call = update(objectType, underLock(fields));
      const held = await run('pending', call);
      const answered = await run('answered', call);
      const notFound = await run('not-found', call);

      expect(held.sent).toHaveLength(1);
      const [write] = held.sent;
      expect(write.method).toBe(
        objectType === 'SERVICE_BINDING' ? 'POST' : 'PUT',
      );
      expect(write.url).not.toContain('_action=');
      // No read after the write: answered, nothing more goes out.
      expect(answered.sent).toEqual(held.sent);
      expect(notFound.sent).toEqual(held.sent);
      expect(notFound.answer?.isError).toBe(true);
      if (objectType === 'SERVICE_BINDING') {
        // The publication request carries no transport request.
        expect(write.url).not.toContain('corrNr');
      } else {
        expect(write.url).toContain(`lockHandle=${LOCK}`);
        expect(write.url).toContain(`corrNr=${TRANSPORT}`);
        expect(answered.answer?.isError).not.toBe(true);
      }
    },
  );

  it.each(DOCUMENTS)(
    '%s: the body is source_code byte for byte, no read',
    async (objectType, fields) => {
      const answered = await run(
        'answered',
        update(objectType, underLock(fields)),
      );
      expect(answered.sent).toHaveLength(1);
      expect(answered.sent[0].method).toBe('PUT');
      expect(answered.sent[0].data).toBe(fields.source_code);
      expect(answered.answer?.isError).not.toBe(true);
    },
  );

  it('FUNCTION_MODULE: the metadata read at its group, then the one write under the given lock_handle, its body the source byte for byte (#2)', async () => {
    const [, fields] = SOURCES.find(([type]) => !notModule([type, 0])) ?? [];
    const call = update('FUNCTION_MODULE', underLock(fields ?? {}));
    const held = await run('pending', call);
    const answered = await run('answered', call);
    const notFound = await run('not-found', call);

    expect(held.sent.map(({ method, url }) => `${method} ${url}`)).toEqual([
      `GET ${MODULE_METADATA}`,
    ]);
    expect(answered.sent.map(({ method }) => method)).toEqual(['GET', 'PUT']);
    const write = answered.sent[1];
    expect(write?.url).toContain(`lockHandle=${LOCK}`);
    expect(write?.url).toContain(`corrNr=${TRANSPORT}`);
    expect(write?.data).toBe('source text');
    expect(answered.answer?.isError).not.toBe(true);
    // SAP refused the metadata read: nothing is written.
    expect(notFound.sent).toEqual(held.sent);
    expect(notFound.answer?.isError).toBe(true);
  });

  it.each(SOURCES.filter(notModule))(
    '%s: the body is the given source, byte for byte',
    async (objectType, fields) => {
      const held = await run('pending', update(objectType, underLock(fields)));
      expect(held.sent[0]?.data).toBe('source text');
    },
  );

  it('the publication carries the requested state', async () => {
    const [, publish] = PUBLICATIONS[0];
    const [, unpublish] = PUBLICATIONS[1];
    const one = await run(
      'pending',
      update('SERVICE_BINDING', underLock(publish)),
    );
    const two = await run(
      'pending',
      update('SERVICE_BINDING', underLock(unpublish)),
    );
    expect(one.sent[0].url).toContain('publish');
    expect(two.sent[0].url).toContain('unpublish');
  });

  it('an OData V2 publication carries service_name and service_version', async () => {
    const [, v2] = PUBLICATIONS[1];
    const held = await run(
      'pending',
      update('SERVICE_BINDING', underLock({ ...v2, service_version: '0002' })),
    );
    const wire = JSON.stringify(held.sent[0]);
    expect(wire).toContain('ZSRV_A');
    expect(wire).toContain('0002');
  });

  it.each(TYPES)(
    '%s: without lock_handle refused before any request',
    async (objectType, fields) => {
      // A service binding's publication runs under the empty handle its
      // lock may answer; every other type needs one.
      // Absent, the schema refuses it (it requires the key); empty, the
      // handler does.
      const absent: Array<[string | undefined, string]> = [
        [
          undefined,
          'Input validation error: Invalid arguments for tool HandlerUpdate: Invalid input: expected string, received undefined at lock_handle',
        ],
      ];
      if (objectType !== 'SERVICE_BINDING') {
        absent.push(['', 'lock_handle is required']);
      }
      for (const [lock_handle, words] of absent) {
        const answered = await run(
          'answered',
          update(objectType, { ...fields, lock_handle }),
        );
        expect(answered.sent).toEqual([]);
        expect(answered.answer?.isError).toBe(true);
        expect(textOf(answered.answer)).toContain(words);
      }
    },
  );

  it.each(DOCUMENTS)(
    '%s: without source_code refused before any request',
    async (objectType, fields) => {
      const answered = await run(
        'answered',
        update(objectType, underLock({ ...fields, source_code: undefined })),
      );
      expect(answered.sent).toEqual([]);
      expect(textOf(answered.answer)).toContain('source_code is required');
    },
  );

  // A type whose write is a target tool's is parsed with that tool's
  // schema: a name it requires, absent, is refused in its words, naming the
  // target, before any request (spec §3).
  it.each([
    ['TABLE', 'table_name', 'UpdateTableLow'],
    ['STRUCTURE', 'structure_name', 'UpdateStructureLow'],
    ['DDL', 'ddl_name', 'UpdateDdlLow'],
    ['CLASS', 'class_name', 'UpdateClassLow'],
    ['PROGRAM', 'program_name', 'UpdateProgramLow'],
    ['INTERFACE', 'interface_name', 'UpdateInterfaceLow'],
    ['FUNCTION_MODULE', 'function_module_name', 'UpdateFunctionModuleLow'],
    ['BEHAVIOR_DEFINITION', 'name', 'UpdateBehaviorDefinitionLow'],
    ['METADATA_EXTENSION', 'name', 'UpdateMetadataExtensionLow'],
  ])(
    "%s without %s: refused by %s's schema, before any request",
    async (objectType, name, target) => {
      const fields = TYPES.find(([type]) => type === objectType)?.[1] ?? {};
      const answered = await run(
        'answered',
        update(objectType, underLock({ ...fields, [name]: undefined })),
      );
      expect(answered.sent).toEqual([]);
      expect(answered.answer?.isError).toBe(true);
      expect(textOf(answered.answer)).toContain(
        `Input validation error: Invalid arguments for tool ${target}: `,
      );
      expect(textOf(answered.answer)).toContain(` at ${name}`);
    },
  );

  it.each(['TRANSPORT', 'RUNTIME_DUMP', 'NO_SUCH_TYPE'])(
    '%s: a type with no update answers in the update route’s words',
    async (objectType) => {
      const answered = await run(
        'answered',
        update(objectType, { lock_handle: LOCK }),
      );
      expect(answered.sent).toEqual([]);
      expect(textOf(answered.answer)).toContain(
        `Unsupported update for object_type: ${objectType}`,
      );
    },
  );
});

/** The types `part` is taken by, as the refusal names them. */
const PART_WORDS =
  'part is taken only by INCLUDE (source or metadata); leave it out for';

describe('HandlerUpdate part: the include’s source or its metadata', () => {
  withSystemContext();

  const include = { include_name: 'ZINCL_A', source_code: 'source text' };

  it.each([
    ['absent', {}],
    ['source', { part: 'source' }],
  ])('INCLUDE part %s: one PUT of the source', async (_label, part) => {
    const held = await run(
      'pending',
      update('INCLUDE', underLock({ ...include, ...part })),
    );
    expect(held.sent).toHaveLength(1);
    expect(held.sent[0].method).toBe('PUT');
    expect(held.sent[0].url).toContain(
      '/programs/includes/zincl_a/source/main',
    );
  });

  it('INCLUDE part metadata: one PUT of the metadata document, as given', async () => {
    const document = DOCUMENT('include:abapInclude');
    const held = await run(
      'pending',
      update(
        'INCLUDE',
        underLock({ ...include, part: 'metadata', source_code: document }),
      ),
    );
    expect(held.sent).toHaveLength(1);
    expect(held.sent[0].method).toBe('PUT');
    expect(held.sent[0].url).toContain('/programs/includes/zincl_a?');
    expect(held.sent[0].url).not.toContain('/source/main');
    expect(held.sent[0].data).toBe(document);
  });

  // A part the schema does not list is refused by the parse, in its words.
  it('INCLUDE with a part of no such name: refused before any request', async () => {
    const answered = await run(
      'answered',
      update('INCLUDE', underLock({ ...include, part: 'urls' })),
    );
    expect(answered.sent).toEqual([]);
    expect(answered.answer?.isError).toBe(true);
    expect(textOf(answered.answer)).toContain(
      'Input validation error: Invalid arguments for tool HandlerUpdate: Invalid option: expected one of "source"|"metadata" at part',
    );
  });

  const others = TYPES.filter(([type]) => type !== 'INCLUDE');

  it.each(
    others.flatMap(([type, fields]) =>
      ['metadata', 'source'].map((part) => [type, part, fields] as const),
    ),
  )(
    '%s with part %s: refused before any request, naming the types that take it',
    async (objectType, part, fields) => {
      const answered = await run(
        'answered',
        update(objectType, underLock({ ...fields, part })),
      );
      expect(answered.sent).toEqual([]);
      expect(answered.answer?.isError).toBe(true);
      expect(textOf(answered.answer)).toContain(`${PART_WORDS} ${objectType}`);
    },
  );

  it('part declares no schema default', () => {
    expect(schemaProperties.part).toEqual({
      type: 'string',
      enum: ['source', 'metadata'],
      description: expect.any(String),
    });
  });
});

const schemaProperties = listedJson(compactUpdateSchema).properties ?? {};

describe('the HandlerUpdate schema and description', () => {
  it('requires object_type and lock_handle', () => {
    expect([...declaredRequired(compactUpdateSchema)].sort()).toEqual([
      'lock_handle',
      'object_type',
    ]);
  });

  it.each([
    'properties',
    'description',
    'datatype',
    'length',
    'decimals',
    'conversion_exit',
    'lowercase',
    'sign_exists',
    'value_table',
    'fixed_values',
    'activate',
    'super_package',
    'behavior_definition',
  ])('%s is not in the schema', (name) => {
    expect(Object.keys(schemaProperties)).not.toContain(name);
  });

  it('names transport_request for each type whose write sends it, and only those', () => {
    const description: string = TOOL_DEFINITION.description;
    for (const [type] of TYPES) {
      const args = description.match(
        new RegExp(`\\b${type}\\(([^)]*)\\)`),
      )?.[1];
      expect({ type, transport: args?.includes('transport_request') }).toEqual({
        type,
        transport: type !== 'SERVICE_BINDING',
      });
    }
  });

  it('names no other tool', () => {
    expect(TOOL_DEFINITION.description).not.toMatch(/Handler[A-Z]/);
  });

  it('transport_request is in the schema', () => {
    expect(Object.keys(schemaProperties)).toContain('transport_request');
  });

  it('desired_publication_state names only states a request sets', () => {
    expect(
      (
        schemaProperties.desired_publication_state as {
          enum: readonly string[];
        }
      ).enum,
    ).toEqual(['published', 'unpublished']);
  });

  it('advertises every type it writes, with only schema arguments', () => {
    const description: string = TOOL_DEFINITION.description;
    const start = description.indexOf('object_type required:');
    expect(start).toBeGreaterThanOrEqual(0);
    const tail = description.slice(start);
    const segment = tail.slice(0, tail.indexOf('. '));
    const advertised = [...segment.matchAll(/([A-Z_]+)\(([^)]*)\)/g)].map(
      ([, type, args]) => [
        type,
        args
          .split(',')
          .map((arg) => arg.trim().replace(/\*$/, ''))
          .filter((arg) => arg.length > 0),
      ],
    ) as Array<[string, string[]]>;
    expect(advertised.map(([type]) => type).sort()).toEqual(
      [...new Set(TYPES.map(([t]) => t))].sort(),
    );
    for (const [type, args] of advertised) {
      expect({
        type,
        foreign: args.filter((arg) => !(arg in schemaProperties)),
      }).toEqual({ type, foreign: [] });
    }
  });
});

describe('HandlerLock and HandlerUnlock take the service types', () => {
  withSystemContext();

  it('their schemas name the service types', () => {
    for (const schema of [compactLockSchema, compactUnlockSchema]) {
      expect(jsonAt(listedJson(schema), 'object_type').enum).toEqual(
        expect.arrayContaining(['SERVICE_DEFINITION', 'SERVICE_BINDING']),
      );
    }
  });

  it.each([
    ['INCLUDE', 'ZINCL_A', '/sap/bc/adt/programs/includes/zincl_a'],
    ['TABLE_TYPE', 'ZTTYP_A', '/sap/bc/adt/ddic/tabletypes/zttyp_a'],
  ])(
    '%s: the lock is one LOCK, the unlock one UNLOCK',
    async (object_type, object_name, uri) => {
      const locked = await run('answered', (context) =>
        handleHandlerLock(context, { object_type, object_name }),
      );
      expect(locked.sent).toHaveLength(1);
      expect(locked.sent[0].url.toLowerCase()).toContain(uri);
      expect(locked.sent[0].url).toContain('_action=LOCK');
      expect(locked.answer?.isError).not.toBe(true);
      expect(textOf(locked.answer)).toContain('lock_handle');

      const unlocked = await run('answered', (context) =>
        handleHandlerUnlock(context, {
          object_type,
          object_name,
          lock_handle: LOCK,
        }),
      );
      expect(unlocked.sent).toHaveLength(1);
      expect(unlocked.sent[0].url.toLowerCase()).toContain(uri);
      expect(unlocked.sent[0].url).toContain('_action=UNLOCK');
      expect(unlocked.answer?.isError).not.toBe(true);
    },
  );

  it.each([
    ['HandlerLock', HandlerLock.variants],
    ['HandlerUnlock', HandlerUnlock.variants],
  ])(
    '%s locks a table type on both variants, an include on premise only',
    (_tool, variants) => {
      const onprem =
        jsonAt(listedJson(variants.onprem.inputSchema), 'object_type').enum ??
        [];
      const cloud =
        jsonAt(listedJson(variants.cloud.inputSchema), 'object_type').enum ??
        [];
      expect(onprem).toEqual(expect.arrayContaining(['INCLUDE', 'TABLE_TYPE']));
      expect(cloud).toContain('TABLE_TYPE');
      expect(cloud).not.toContain('INCLUDE');
    },
  );

  it('HandlerUpdate’s schema names every type it writes', () => {
    const named = jsonAt(listedJson(compactUpdateSchema), 'object_type').enum;
    expect(named).toEqual(
      expect.arrayContaining([...new Set(TYPES.map(([t]) => t))]),
    );
  });

  it.each([
    ['SERVICE_DEFINITION', 'ZSRVD_A', '/sap/bc/adt/ddic/srvd/sources/zsrvd_a'],
    [
      'SERVICE_BINDING',
      'ZSRVB_A',
      '/sap/bc/adt/businessservices/bindings/zsrvb_a',
    ],
  ])(
    '%s: the lock is one LOCK, the unlock one UNLOCK',
    async (object_type, object_name, uri) => {
      const locked = await run('answered', (context) =>
        handleHandlerLock(context, {
          object_type: object_type as never,
          object_name,
        }),
      );
      expect(locked.sent).toHaveLength(1);
      expect(locked.sent[0].url.toLowerCase()).toContain(uri);
      expect(locked.sent[0].url).toContain('_action=LOCK');
      expect(locked.answer?.isError).not.toBe(true);
      expect(textOf(locked.answer)).toContain('lock_handle');

      const unlocked = await run('answered', (context) =>
        handleHandlerUnlock(context, {
          object_type: object_type as never,
          object_name,
          lock_handle: LOCK,
        }),
      );
      expect(unlocked.sent).toHaveLength(1);
      expect(unlocked.sent[0].url.toLowerCase()).toContain(uri);
      expect(unlocked.sent[0].url).toContain('_action=UNLOCK');
      expect(unlocked.answer?.isError).not.toBe(true);
    },
  );

  it('a service binding open in an editing session: its LOCK’s 403 is a lock with an empty handle, and the publication runs under it', async () => {
    const locked = await run('forbidden', (context) =>
      handleHandlerLock(context, {
        object_type: 'SERVICE_BINDING' as never,
        object_name: 'ZSRVB_A',
      }),
    );
    expect(locked.sent).toHaveLength(1);
    expect(locked.answer?.isError).not.toBe(true);
    expect(JSON.parse(textOf(locked.answer)).lock_handle).toBe('');

    const [, publish] = PUBLICATIONS[0];
    const held = await run(
      'pending',
      update('SERVICE_BINDING', { ...publish, lock_handle: '' }),
    );
    expect(held.sent).toHaveLength(1);
    expect(held.sent[0].method).toBe('POST');
  });

  it.each([
    ['holding the lock of the other cases', undefined],
    ['with held locks (Streamable HTTP)', new HeldLocks()],
  ])(
    'unlocking a service binding with an empty lock_handle, %s: nothing to unlock, nothing sent',
    async (_where, heldLocks) => {
      const answered = await run('answered', (context) =>
        handleHandlerUnlock(
          { ...context, ...(heldLocks ? { heldLocks } : {}) } as HandlerContext,
          {
            object_type: 'SERVICE_BINDING' as never,
            object_name: 'ZSRVB_A',
            lock_handle: '',
          },
        ),
      );
      expect(answered.sent).toEqual([]);
      expect(answered.answer?.isError).not.toBe(true);
      expect(textOf(answered.answer)).toContain(
        'Nothing to unlock: the service binding holds no lock handle',
      );
    },
  );

  it('a 403 LOCK of another type stays a refusal', async () => {
    const refused = await run('forbidden', (context) =>
      handleHandlerLock(context, {
        object_type: 'SERVICE_DEFINITION' as never,
        object_name: 'ZSRVD_A',
      }),
    );
    expect(refused.answer?.isError).toBe(true);
  });

  it('a refused LOCK of a service binding is answered as SAP sent it', async () => {
    const refused = await run('not-found', (context) =>
      handleHandlerLock(context, {
        object_type: 'SERVICE_BINDING' as never,
        object_name: 'ZSRVB_A',
      }),
    );
    expect(refused.sent).toHaveLength(1);
    expect(refused.answer?.isError).toBe(true);
    expect(textOf(refused.answer)).toContain('404');
  });
});
