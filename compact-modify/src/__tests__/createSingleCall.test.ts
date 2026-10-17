/**
 * Compact `HandlerCreate` is one ADT request: the `POST` of the type's
 * adt-clients `create()`, for every type — no validate, lock, write, unlock,
 * check or activate, no service-group read, no read-back (spec §4.6, the
 * owner's rule: compact is one request per tool call, the consumer chains).
 * There is no flag and no mode.
 *
 * Real adt-clients code runs over a recording connection; nothing of it is
 * doubled. Pinned per type:
 *
 * - exactly one request, the create's `POST`, held open or answered (an empty
 *   `200`, a `404`, a `400`) alike, and that request — method, address and body
 *   — is one the full set's `Create<Type>` sends for the same arguments;
 * - an argument its create does not send is refused before any request, by
 *   presence (`false`, `0`, `''` included), naming it;
 * - UNIT_TEST and CDS_UNIT_TEST, whose create is a chain, are refused before
 *   any request, pointing to the full set.
 */
import { compactCreateSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleCreateBehaviorDefinition,
  handleCreateBehaviorImplementation,
  handleCreateClass,
  handleCreateDataElement,
  handleCreateDdl,
  handleCreateDomain,
  handleCreateFunctionGroup,
  handleCreateFunctionModule,
  handleCreateInterface,
  handleCreateMetadataExtension,
  handleCreatePackage,
  handleCreateProgram,
  handleCreateServiceBinding,
  handleCreateServiceDefinition,
  handleCreateStructure,
  handleCreateTable,
  handleCreateTransport,
} from '@mcp-abap-adt/lib/handlers/write';
import { LOCK_SUCCESS_XML } from '../../../src/__tests__/helpers/recordingConnection';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../src/lib/systemContext';
import { compactWriteRouterMap } from '../handlers/compactWriteRoutes';
import {
  handleHandlerCreate,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerCreate';

type Sent = { method: string; url: string; data?: unknown };
type Mode = 'pending' | 'answered' | 'not-found' | 'bad-request';
type Answer = { isError?: boolean; content?: Array<{ text?: string }> };

/**
 * The `400` SAP may answer a function group create that landed: the full
 * create reads the group back after it; every type's create answers it here.
 */
const INTERFACE_NOT_CREATED =
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
  '<namespace id="com.sap.adt"/><type id="ExceptionResourceCreationFailure"/>' +
  '<message lang="EN">Interface SAPLZFG_A has not been created</message></exc:exception>';

/** A connection that records every request and answers per `mode`. */
function recording(mode: Mode, body = '') {
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
      });
      if (mode === 'pending') return new Promise<never>(() => {});
      if (mode === 'not-found') {
        return { status: 404, statusText: 'Not Found', headers: {}, data: '' };
      }
      if (mode === 'bad-request') {
        return {
          status: 400,
          statusText: 'Bad Request',
          headers: {},
          data: INTERFACE_NOT_CREATED,
        };
      }
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        data: String(options.url).includes('_action=LOCK')
          ? LOCK_SUCCESS_XML
          : body,
      };
    },
  };
  return { connection, sent };
}

const silent = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const contextOver = (connection: unknown) =>
  ({ connection, logger: silent }) as unknown as HandlerContext;

/** Lets every queued callback and immediate run, so a held handler sends all it can. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

type Run = { sent: Sent[]; answer?: Answer };

/** Runs `call` over a fresh recording connection in `mode`. */
async function run(
  mode: Mode,
  call: (context: HandlerContext) => Promise<unknown>,
  body?: string,
): Promise<Run> {
  const { connection, sent } = recording(mode, body);
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

/** What SAP answers a created transport request: its number. */
const TRANSPORT_DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="XXXK900001"/>';

/** The answer body per type, where an empty one is not an answer of a create. */
const BODY: Record<string, string> = { TRANSPORT: TRANSPORT_DOCUMENT };

/** Every type `HandlerCreate` creates, each with the arguments its create needs. */
const TYPES: Array<[string, Record<string, unknown>]> = [
  [
    'PACKAGE',
    {
      package_name: 'ZPKG_A',
      super_package: 'ZPKG_SUPER',
      description: 'A package',
    },
  ],
  ['DOMAIN', { domain_name: 'ZDOM_A', package_name: 'ZPKG_A' }],
  ['DATA_ELEMENT', { data_element_name: 'ZDTEL_A', package_name: 'ZPKG_A' }],
  ['TRANSPORT', { description: 'A request' }],
  ['TABLE', { table_name: 'ZTAB_A', package_name: 'ZPKG_A' }],
  ['STRUCTURE', { structure_name: 'ZSTRU_A', package_name: 'ZPKG_A' }],
  ['DDL', { ddl_name: 'ZDDL_A', package_name: 'ZPKG_A' }],
  [
    'SERVICE_DEFINITION',
    { service_definition_name: 'ZSRVD_A', package_name: 'ZPKG_A' },
  ],
  [
    'SERVICE_BINDING',
    {
      service_binding_name: 'ZSRVB_A',
      service_definition_name: 'ZSRVD_A',
      package_name: 'ZPKG_A',
    },
  ],
  ['CLASS', { class_name: 'ZCL_A', package_name: 'ZPKG_A' }],
  ['PROGRAM', { program_name: 'ZPROG_A', package_name: 'ZPKG_A' }],
  ['INTERFACE', { interface_name: 'ZIF_A', package_name: 'ZPKG_A' }],
  ['FUNCTION_GROUP', { function_group_name: 'ZFG_A', package_name: 'ZPKG_A' }],
  [
    'FUNCTION_MODULE',
    {
      function_module_name: 'Z_FM_A',
      function_group_name: 'ZFG_A',
      package_name: 'ZPKG_A',
    },
  ],
  [
    'BEHAVIOR_DEFINITION',
    {
      name: 'ZBDEF_A',
      package_name: 'ZPKG_A',
      implementation_type: 'Managed',
    },
  ],
  ['BEHAVIOR_IMPLEMENTATION', { class_name: 'ZBP_A', package_name: 'ZPKG_A' }],
  ['METADATA_EXTENSION', { name: 'ZDDLX_A', package_name: 'ZPKG_A' }],
];

/** The types whose create is a chain: refused, pointing to the full set's tool. */
const CHAINS: Array<[string, string, Record<string, unknown>]> = [
  [
    'UNIT_TEST',
    'CreateUnitTest',
    { class_name: 'ZCL_A', test_class_source: 'CLASS ltc DEFINITION.' },
  ],
  [
    'CDS_UNIT_TEST',
    'CreateCdsUnitTest',
    {
      cds_view_name: 'ZDDL_A',
      class_name: 'ZCL_T',
      package_name: 'ZPKG_A',
      test_class_source: 'CLASS ltc DEFINITION.',
    },
  ],
];

type Full = (context: HandlerContext, args: never) => Promise<unknown>;

/**
 * The full set's `Create<Type>`, with what it needs beyond the create request
 * (its later steps' input) — the reference the one request is taken from.
 */
const FULL: Record<string, [Full, Record<string, unknown>]> = {
  PACKAGE: [handleCreatePackage as Full, {}],
  DOMAIN: [handleCreateDomain as Full, {}],
  DATA_ELEMENT: [handleCreateDataElement as Full, {}],
  TRANSPORT: [handleCreateTransport as Full, {}],
  TABLE: [handleCreateTable as Full, {}],
  STRUCTURE: [
    handleCreateStructure as Full,
    { fields: [{ name: 'FIELD_A', data_type: 'CHAR', length: 10 }] },
  ],
  DDL: [handleCreateDdl as Full, {}],
  SERVICE_DEFINITION: [handleCreateServiceDefinition as Full, {}],
  SERVICE_BINDING: [handleCreateServiceBinding as Full, {}],
  CLASS: [handleCreateClass as Full, {}],
  PROGRAM: [handleCreateProgram as Full, {}],
  INTERFACE: [handleCreateInterface as Full, {}],
  FUNCTION_GROUP: [handleCreateFunctionGroup as Full, {}],
  FUNCTION_MODULE: [handleCreateFunctionModule as Full, {}],
  BEHAVIOR_DEFINITION: [
    handleCreateBehaviorDefinition as Full,
    { root_entity: 'ZBDEF_A' },
  ],
  BEHAVIOR_IMPLEMENTATION: [
    handleCreateBehaviorImplementation as Full,
    { behavior_definition: 'ZBDEF_A' },
  ],
  METADATA_EXTENSION: [handleCreateMetadataExtension as Full, {}],
};

const fullCreate =
  (objectType: string, fields: Record<string, unknown>) =>
  (context: HandlerContext) => {
    const [handler, extra] = FULL[objectType];
    return handler(context, {
      object_type: objectType,
      ...fields,
      ...extra,
    } as never);
  };

const create =
  (object_type: string, fields: Record<string, unknown>) =>
  (context: HandlerContext) =>
    handleHandlerCreate(context, { object_type, ...fields } as never);

const textOf = (answer?: Answer) => answer?.content?.[0]?.text ?? '';

const withSystemContext = () => {
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());
};

describe('HandlerCreate is one POST', () => {
  withSystemContext();

  it('covers every type of the create route', () => {
    const withCreate = Object.entries(compactWriteRouterMap)
      .filter(([, routes]) => routes.create !== undefined)
      .map(([type]) => type)
      .sort();
    expect(withCreate).toEqual(
      [...TYPES.map(([type]) => type), ...CHAINS.map(([type]) => type)].sort(),
    );
  });

  it.each(TYPES)(
    '%s: exactly one request, the create’s POST',
    async (objectType, fields) => {
      const held = await run('pending', create(objectType, fields));
      const answered = await run(
        'answered',
        create(objectType, fields),
        BODY[objectType],
      );
      const notFound = await run('not-found', create(objectType, fields));
      const badRequest = await run('bad-request', create(objectType, fields));
      const full = await run(
        'answered',
        fullCreate(objectType, fields),
        BODY[objectType],
      );

      expect(held.sent).toHaveLength(1);
      expect(held.sent[0].method).toBe('POST');
      expect(answered.sent).toEqual(held.sent);
      expect(notFound.sent).toEqual(held.sent);
      expect(badRequest.sent).toEqual(held.sent);
      expect(answered.answer?.isError).not.toBe(true);
      expect(notFound.answer?.isError).toBe(true);
      expect(badRequest.answer?.isError).toBe(true);
      // The one request is the create the full set's Create<Type> sends: no
      // validation, no lock — a request of the full chain, byte for byte.
      expect(held.sent[0].url).not.toContain('validation');
      expect(held.sent[0].url).not.toContain('_action=');
      expect(full.sent).toContainEqual(held.sent[0]);
    },
  );

  it('SERVICE_BINDING sends no service-group read', async () => {
    const fields = new Map(TYPES).get('SERVICE_BINDING') ?? {};
    const answered = await run('answered', create('SERVICE_BINDING', fields));
    // The full create, answered, does read it — the reference proves the
    // probe sees the read when it is sent.
    const full = await run('answered', fullCreate('SERVICE_BINDING', fields));
    expect(full.sent.filter((sent) => sent.method === 'GET')).not.toEqual([]);
    expect(answered.sent).toHaveLength(1);
    expect(answered.sent.filter((sent) => sent.method === 'GET')).toEqual([]);
  });

  it('FUNCTION_GROUP sends no read-back after a 400 — the 400 is the answer', async () => {
    const fields = new Map(TYPES).get('FUNCTION_GROUP') ?? {};
    const answered = await run('bad-request', create('FUNCTION_GROUP', fields));
    const full = await run('bad-request', fullCreate('FUNCTION_GROUP', fields));
    // The full create reads itself back after a 400; the compact one does not.
    expect(full.sent.length).toBeGreaterThan(1);
    expect(answered.sent).toHaveLength(1);
    expect(answered.sent[0].method).toBe('POST');
    expect(answered.answer?.isError).toBe(true);
    expect(textOf(answered.answer)).toContain('has not been created');
  });

  it.each(CHAINS)(
    '%s: its create is a chain — refused before any request, pointing to %s',
    async (objectType, fullTool, fields) => {
      const answered = await run('answered', create(objectType, fields));
      expect(answered.sent).toEqual([]);
      expect(answered.answer?.isError).toBe(true);
      expect(textOf(answered.answer)).toContain(
        `HandlerCreate does not create ${objectType}: its create is a chain of requests, not one — use ${fullTool} of the full set`,
      );
    },
  );

  it.each(['LOCAL_TYPES', 'RUNTIME_DUMP', 'NO_SUCH_TYPE'])(
    '%s: a type with no create answers in the create route’s words',
    async (objectType) => {
      const answered = await run('answered', create(objectType, {}));
      expect(answered.sent).toEqual([]);
      expect(textOf(answered.answer)).toContain(
        `Unsupported create for object_type: ${objectType}`,
      );
    },
  );
});

/**
 * What each type's create request carries, as measured — kept here
 * independently of the handler's own list, so a list widened there turns this
 * red. Beside these, every type accepts `transport_request`, `package_name`,
 * `description` and `detail`.
 */
const CARRIES: Record<string, string[]> = {
  PACKAGE: [
    'package_name',
    'super_package',
    'description',
    'package_type',
    'software_component',
    'transport_layer',
    'transport_request',
    'record_changes',
    'application_component',
    'master_language',
  ],
  DOMAIN: ['domain_name', 'master_language'],
  DATA_ELEMENT: ['data_element_name', 'master_language'],
  TRANSPORT: ['transport_type', 'target_system', 'owner'],
  TABLE: ['table_name', 'master_language'],
  STRUCTURE: ['structure_name', 'master_language'],
  DDL: ['ddl_name', 'master_language'],
  SERVICE_DEFINITION: ['service_definition_name', 'master_language'],
  SERVICE_BINDING: [
    'service_binding_name',
    'service_definition_name',
    'service_name',
    'service_version',
    'binding_variant',
    'master_language',
  ],
  CLASS: [
    'class_name',
    'superclass',
    'final',
    'create_protected',
    'master_language',
  ],
  PROGRAM: ['program_name', 'program_type', 'application', 'master_language'],
  INTERFACE: ['interface_name', 'master_language'],
  FUNCTION_GROUP: ['function_group_name', 'master_language'],
  FUNCTION_MODULE: ['function_module_name', 'function_group_name'],
  BEHAVIOR_DEFINITION: ['name', 'implementation_type', 'master_language'],
  BEHAVIOR_IMPLEMENTATION: ['class_name'],
  METADATA_EXTENSION: ['name', 'master_language'],
};

/** Accepted for every type: the common three, and what is not a request argument. */
const ACCEPTED_EVERYWHERE = [
  'object_type',
  'detail',
  'transport_request',
  'package_name',
  'description',
];

/**
 * Accepted though the request was measured not to carry them — the common
 * three where adt-clients' create does not send them. Named so the probe
 * below does not expect them on the wire.
 */
const ACCEPTED_NOT_SENT: Record<string, string[]> = {
  TRANSPORT: ['transport_request', 'package_name'],
  TABLE: ['description'],
  SERVICE_BINDING: ['transport_request'],
  FUNCTION_MODULE: ['package_name'],
  METADATA_EXTENSION: ['transport_request'],
};

/** A value an accepted argument may take, so the create still builds. */
const SAMPLE: Record<string, unknown> = {
  transport_request: 'XXXK900001',
  transport_type: 'workbench',
  binding_variant: 'ODATA_V4_UI',
  program_type: 'executable',
  implementation_type: 'Managed',
  record_changes: true,
  final: true,
  create_protected: true,
  master_language: 'EN',
};

/**
 * Every argument a caller of 18 could give `HandlerCreate` (its schema then)
 * and a few no create names: what no create sends is refused, schema or not.
 */
const KNOWN: Record<string, 'string' | 'boolean' | 'number' | 'array'> = {
  activate: 'boolean',
  create_only: 'boolean',
  abstract: 'boolean',
  datatype: 'string',
  length: 'number',
  decimals: 'number',
  conversion_exit: 'string',
  lowercase: 'boolean',
  sign_exists: 'boolean',
  value_table: 'string',
  fixed_values: 'array',
  root_entity: 'string',
  behavior_definition: 'string',
  cds_view_name: 'string',
  fields: 'array',
  test_class_source: 'string',
  source_code: 'string',
  response_format: 'string',
  lock_handle: 'string',
};

const schemaProperties = compactCreateSchema.properties as Record<
  string,
  { type?: string }
>;

const kindOf = (name: string) => KNOWN[name] ?? schemaProperties[name]?.type;

/** A value of `name`'s kind and its empty one (`false`, `0`, `''`, `[]`). */
function valuesOf(name: string): Array<[string, unknown]> {
  switch (kindOf(name)) {
    case 'boolean':
      return [
        ['true', true],
        ['false', false],
      ];
    case 'number':
      return [
        ['1', 1],
        ['0', 0],
      ];
    case 'array':
      return [
        ['[x]', [{}]],
        ['[]', []],
      ];
    default:
      return [
        ["'X'", 'X'],
        ["''", ''],
      ];
  }
}

type NotSentCase = [string, string, string, unknown];

/** Per type, every argument its create does not send, with each value tried. */
function notSentCases(objectType: string): NotSentCase[] {
  const accepted = new Set([...ACCEPTED_EVERYWHERE, ...CARRIES[objectType]]);
  const names = new Set([
    ...Object.keys(schemaProperties),
    ...Object.keys(KNOWN),
  ]);
  const cases: NotSentCase[] = [];
  for (const name of names) {
    if (accepted.has(name)) continue;
    for (const [shown, value] of valuesOf(name)) {
      cases.push([objectType, name, shown, value]);
    }
  }
  return cases;
}

const NOT_SENT_CASES = TYPES.flatMap(([objectType]) =>
  notSentCases(objectType),
);

const TYPE_FIELDS = new Map(TYPES);
const fieldsOf = (objectType: string) => TYPE_FIELDS.get(objectType) ?? {};

const NOT_SENT_WORDS =
  'leave it out; then HandlerLock, HandlerUpdate with the lock_handle, HandlerUnlock and HandlerActivate';

describe('HandlerCreate refuses an argument its create does not send', () => {
  withSystemContext();

  it.each(NOT_SENT_CASES)(
    '%s with %s = %s: refused before any request, naming it',
    async (objectType, name, _shown, value) => {
      const answered = await run(
        'answered',
        create(objectType, { ...fieldsOf(objectType), [name]: value }),
      );
      expect(answered.sent).toEqual([]);
      expect(answered.answer?.isError).toBe(true);
      expect(textOf(answered.answer)).toContain(
        `HandlerCreate sends the create request alone: ${name} is not sent — ${NOT_SENT_WORDS}`,
      );
    },
  );

  it('names every argument it does not send', async () => {
    const answered = await run(
      'answered',
      create('STRUCTURE', {
        ...fieldsOf('STRUCTURE'),
        fields: [],
        activate: false,
      }),
    );
    expect(answered.sent).toEqual([]);
    expect(textOf(answered.answer)).toContain(
      'HandlerCreate sends the create request alone: fields, activate are not sent',
    );
  });

  it('an argument given as undefined is absent', async () => {
    const held = await run(
      'pending',
      create('DOMAIN', { ...fieldsOf('DOMAIN'), activate: undefined }),
    );
    expect(held.sent).toHaveLength(1);
  });

  it.each(TYPES.map(([type]) => [type]))(
    '%s: every argument it accepts, given at once, still sends the one create',
    async (objectType) => {
      const fields: Record<string, unknown> = { ...fieldsOf(objectType) };
      for (const name of [
        'transport_request',
        'package_name',
        'description',
        'detail',
        ...CARRIES[objectType],
      ]) {
        if (fields[name] === undefined) {
          fields[name] =
            name === 'detail' ? 'full' : (SAMPLE[name] ?? `ZACC_${name}`);
        }
      }
      const held = await run('pending', create(objectType, fields));
      expect(held.sent).toHaveLength(1);
      expect(held.sent[0].method).toBe('POST');
    },
  );

  it.each(TYPES.map(([type]) => [type]))(
    '%s: each accepted string argument reaches the create request',
    async (objectType) => {
      const unsent = new Set(ACCEPTED_NOT_SENT[objectType] ?? []);
      const probed = [
        'transport_request',
        'package_name',
        'description',
        ...CARRIES[objectType],
      ].filter((name) => !unsent.has(name) && SAMPLE[name] === undefined);
      for (const name of new Set(probed)) {
        const marker = `QPROBE${name.replace(/_/g, '').toUpperCase()}`;
        const held = await run(
          'pending',
          create(objectType, { ...fieldsOf(objectType), [name]: marker }),
        );
        const wire = held.sent
          .map((sent) => `${sent.url} ${String(sent.data)}`)
          .join(' ')
          .toUpperCase();
        expect({ name, carried: wire.includes(marker) }).toEqual({
          name,
          carried: true,
        });
      }
    },
  );
});

describe('the HandlerCreate schema and description', () => {
  it('create_only is not in the schema', () => {
    expect(Object.keys(schemaProperties)).not.toContain('create_only');
  });

  it('names only what some create sends', () => {
    const sent = new Set([
      ...ACCEPTED_EVERYWHERE,
      ...Object.values(CARRIES).flat(),
    ]);
    expect(
      Object.keys(schemaProperties).filter((name) => !sent.has(name)),
    ).toEqual([]);
  });

  it('advertises per type only what that type’s create sends', () => {
    const advertised = [
      ...TOOL_DEFINITION.description.matchAll(/([A-Z_]+)\(([^)]*)\)/g),
    ].map(([, type, args]) => [
      type,
      args
        .split(',')
        .map((arg) => arg.trim().replace(/\*$/, ''))
        .filter((arg) => arg.length > 0),
    ]) as Array<[string, string[]]>;
    expect(advertised.map(([type]) => type).sort()).toEqual(
      TYPES.map(([type]) => type).sort(),
    );
    for (const [type, args] of advertised) {
      const accepted = new Set([...ACCEPTED_EVERYWHERE, ...CARRIES[type]]);
      expect({
        type,
        foreign: args.filter((arg) => !accepted.has(arg)),
      }).toEqual({ type, foreign: [] });
    }
  });
});
