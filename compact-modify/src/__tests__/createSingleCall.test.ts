/**
 * Compact `HandlerCreate` is one operation, the create: no validate, lock,
 * write, unlock, check or activate, no service-group read, no read-back
 * (spec §4.6, the owner's rule: a compact tool does one operation, the
 * consumer chains). There is no flag and no mode. For every type but
 * TRANSPORT the create is the `POST` of the type's adt-clients `create()`.
 * A TRANSPORT create also types the task SAP creates with the request,
 * Unclassified (`CL_CTS_ADT_RES_OBJ_RECORD` inserts it with
 * `wi_trfunction = 'X'`): the `POST`, the read of the new request for its
 * task, and the `changetasktype` `PUT` on that task, and nothing else.
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

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import {
  compactCreateSchema,
  memberTokens,
} from '@mcp-abap-adt/lib/compact-shared';
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
  handleCreateInclude,
  handleCreateInterface,
  handleCreateMetadataExtension,
  handleCreatePackage,
  handleCreateProgram,
  handleCreateServiceBinding,
  handleCreateServiceDefinition,
  handleCreateStructure,
  handleCreateTable,
  handleCreateTableType,
  handleCreateTransport,
} from '@mcp-abap-adt/lib/handlers/write';
import {
  jsonFind,
  listedJson,
} from '../../../src/__tests__/helpers/listedJson';
import { setSystemContext } from '../../../src/__tests__/helpers/processSystemContext';
import { LOCK_SUCCESS_XML } from '../../../src/__tests__/helpers/recordingConnection';
import { resetSystemContextCache } from '../../../src/lib/systemContext';
import { compactWriteRouterMap } from '../handlers/compactWriteRoutes';
import {
  handleHandlerCreate,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerCreate';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

type Sent = { method: string; url: string; data?: unknown };
type Mode = 'pending' | 'answered' | 'not-found' | 'bad-request';
type Answer = { isError?: boolean; content?: Array<{ text?: string }> };

/**
 * The `400` SAP may answer a function group create that landed, with its
 * T100 key (`EC 304`): the full create reads the group back after it; every
 * type's create answers it here.
 */
const INTERFACE_NOT_CREATED =
  '<?xml version="1.0" encoding="utf-8"?><exc:exception xmlns:exc="http://www.sap.com/abapxml/types/communicationframework">' +
  '<namespace id="com.sap.adt"/><type id="ExceptionResourceCreationFailure"/>' +
  '<message lang="EN">Interface SAPLZFG_A has not been created</message>' +
  '<properties><entry key="T100KEY-ID">EC</entry><entry key="T100KEY-NO">304</entry></properties></exc:exception>';

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

/**
 * What SAP answers a created transport request: its number — and, read
 * back, the request with the one task SAP created with it.
 */
const TRANSPORT_DOCUMENT =
  '<?xml version="1.0" encoding="utf-8"?><tm:root xmlns:tm="http://www.sap.com/cts/adt/tm" tm:number="XXXK900001"><tm:request tm:number="XXXK900001"><tm:task tm:number="XXXK900002" tm:type="X"/></tm:request></tm:root>';

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
  [
    'BEHAVIOR_IMPLEMENTATION',
    {
      class_name: 'ZBP_A',
      behavior_definition: 'ZBDEF_A',
      package_name: 'ZPKG_A',
    },
  ],
  ['METADATA_EXTENSION', { name: 'ZDDLX_A', package_name: 'ZPKG_A' }],
  ['INCLUDE', { include_name: 'ZINCL_A', package_name: 'ZPKG_A' }],
  ['TABLE_TYPE', { table_type_name: 'ZTTYP_A', package_name: 'ZPKG_A' }],
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
  INCLUDE: [handleCreateInclude, {}],
  TABLE_TYPE: [handleCreateTableType, {}],
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
    assert.deepStrictEqual(
      withCreate,
      [...TYPES.map(([type]) => type), ...CHAINS.map(([type]) => type)].sort(),
    );
  });

  it('TRANSPORT: the create’s POST, the read of the new request, the type change of its task, and nothing else', async () => {
    const fields = new Map(TYPES).get('TRANSPORT') ?? {};
    const held = await run('pending', create('TRANSPORT', fields));
    const answered = await run(
      'answered',
      create('TRANSPORT', fields),
      TRANSPORT_DOCUMENT,
    );
    const notFound = await run('not-found', create('TRANSPORT', fields));
    const full = await run(
      'answered',
      fullCreate('TRANSPORT', fields),
      TRANSPORT_DOCUMENT,
    );
    assert.deepStrictEqual(
      held.sent.map((sent) => `${sent.method} ${sent.url}`),
      ['POST /sap/bc/adt/cts/transportrequests'],
    );
    assert.deepStrictEqual(
      answered.sent.map((sent) => `${sent.method} ${sent.url}`),
      [
        'POST /sap/bc/adt/cts/transportrequests',
        'GET /sap/bc/adt/cts/transportrequests/XXXK900001',
        'PUT /sap/bc/adt/cts/transportrequests/XXXK900002',
      ],
    );
    assert.ok(
      String(answered.sent[2]?.data).includes('tm:useraction="changetasktype"'),
    );
    assert.notEqual(answered.answer?.isError, true);
    // A refused create is the answer: nothing follows it.
    assert.deepStrictEqual(notFound.sent, held.sent);
    assert.equal(notFound.answer?.isError, true);
    // The same requests as the full set's CreateTransport.
    assert.deepStrictEqual(full.sent, answered.sent);
  });

  it('TRANSPORT task_type R: the task is typed R, as the full set’s CreateTransport types it', async () => {
    const fields = { description: 'A request', task_type: 'R' };
    const answered = await run(
      'answered',
      create('TRANSPORT', fields),
      TRANSPORT_DOCUMENT,
    );
    const full = await run(
      'answered',
      fullCreate('TRANSPORT', fields),
      TRANSPORT_DOCUMENT,
    );
    assert.notEqual(answered.answer?.isError, true);
    assert.deepStrictEqual(
      answered.sent.map((sent) => `${sent.method} ${sent.url}`),
      [
        'POST /sap/bc/adt/cts/transportrequests',
        'GET /sap/bc/adt/cts/transportrequests/XXXK900001',
        'PUT /sap/bc/adt/cts/transportrequests/XXXK900002',
      ],
    );
    assert.ok(
      String(answered.sent[2]?.data).includes(
        '<tm:task tm:number="XXXK900002" tm:type="R"/>',
      ),
    );
    assert.deepStrictEqual(full.sent, answered.sent);
  });

  it('TRANSPORT task_type X: the task stays as SAP created it, no type change sent', async () => {
    const fields = { description: 'A request', task_type: 'X' };
    const answered = await run(
      'answered',
      create('TRANSPORT', fields),
      TRANSPORT_DOCUMENT,
    );
    const full = await run(
      'answered',
      fullCreate('TRANSPORT', fields),
      TRANSPORT_DOCUMENT,
    );
    assert.notEqual(answered.answer?.isError, true);
    assert.ok(!answered.sent.map((sent) => sent.method).includes('PUT'));
    assert.deepStrictEqual(full.sent, answered.sent);
  });

  for (const [objectType, fields] of TYPES.filter(
    ([type]) => type !== 'TRANSPORT',
  )) {
    it(
      format('%s: exactly one request, the create’s POST', objectType),
      async () => {
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

        assert.equal(held.sent.length, 1);
        assert.equal(held.sent[0].method, 'POST');
        assert.deepStrictEqual(answered.sent, held.sent);
        assert.deepStrictEqual(notFound.sent, held.sent);
        assert.deepStrictEqual(badRequest.sent, held.sent);
        assert.notEqual(answered.answer?.isError, true);
        assert.equal(notFound.answer?.isError, true);
        assert.equal(badRequest.answer?.isError, true);
        // The one request is the create the full set's Create<Type> sends: no
        // validation, no lock — a request of the full chain, byte for byte.
        assert.ok(!held.sent[0].url.includes('validation'));
        assert.ok(!held.sent[0].url.includes('_action='));
        assert.ok(full.sent.some((e) => isDeepStrictEqual(e, held.sent[0])));
      },
    );
  }

  it('SERVICE_BINDING sends no service-group read', async () => {
    const fields = new Map(TYPES).get('SERVICE_BINDING') ?? {};
    const answered = await run('answered', create('SERVICE_BINDING', fields));
    // The full create, answered, does read it — the reference proves the
    // probe sees the read when it is sent.
    const full = await run('answered', fullCreate('SERVICE_BINDING', fields));
    assert.notDeepStrictEqual(
      full.sent.filter((sent) => sent.method === 'GET'),
      [],
    );
    assert.equal(answered.sent.length, 1);
    assert.deepStrictEqual(
      answered.sent.filter((sent) => sent.method === 'GET'),
      [],
    );
  });

  it('FUNCTION_GROUP sends no read-back after a 400 — the 400 is the answer', async () => {
    const fields = new Map(TYPES).get('FUNCTION_GROUP') ?? {};
    const answered = await run('bad-request', create('FUNCTION_GROUP', fields));
    const full = await run('bad-request', fullCreate('FUNCTION_GROUP', fields));
    // The full create reads itself back after a 400; the compact one does not.
    assert.ok(full.sent.length > 1);
    assert.equal(answered.sent.length, 1);
    assert.equal(answered.sent[0].method, 'POST');
    assert.equal(answered.answer?.isError, true);
    assert.ok(textOf(answered.answer).includes('has not been created'));
  });

  // 24.0.0 (D2, the owner): a program create takes no program type — SAP
  // ignores it on create (measured). One still given is not an argument of
  // HandlerCreate: refused before any request, naming it.
  it('PROGRAM with program_type: refused before any request, naming it', async () => {
    const answered = await run(
      'answered',
      create('PROGRAM', {
        program_name: 'ZPROG_A',
        package_name: 'ZPKG_A',
        program_type: 'include',
      }),
    );
    assert.deepStrictEqual(answered.sent, []);
    assert.equal(answered.answer?.isError, true);
    assert.ok(
      textOf(answered.answer).includes(
        'program_type is not an argument of HandlerCreate',
      ),
    );
  });

  // A type whose create is a target tool's is parsed with that tool's
  // schema: what the target requires or lists is refused in its words,
  // naming the target, before any request (spec §3).
  for (const [objectType, change, target, at] of [
    ['PACKAGE', { package_type: 'X' }, 'CreatePackage', 'package_type'],
    ['TRANSPORT', { description: undefined }, 'CreateTransport', 'description'],
    ['TABLE', { table_name: undefined }, 'CreateTable', 'table_name'],
    ['DDL', { ddl_name: undefined }, 'CreateDdl', 'ddl_name'],
    ['CLASS', { class_name: undefined }, 'CreateClass', 'class_name'],
    ['PROGRAM', { program_name: undefined }, 'CreateProgram', 'program_name'],
    [
      'INTERFACE',
      { interface_name: undefined },
      'CreateInterface',
      'interface_name',
    ],
    [
      'FUNCTION_MODULE',
      { function_module_name: undefined },
      'CreateFunctionModule',
      'function_module_name',
    ],
    ['INCLUDE', { include_name: undefined }, 'CreateInclude', 'include_name'],
  ] satisfies [string, Record<string, unknown>, string, string][]) {
    it(
      format(
        "%s with %o: refused by %s's schema at %s, before any request",
        objectType,
        change,
        target,
        at,
      ),
      async () => {
        const answered = await run(
          'answered',
          create(objectType, { ...fieldsOf(objectType), ...change }),
        );
        assert.deepStrictEqual(answered.sent, []);
        assert.equal(answered.answer?.isError, true);
        assert.ok(
          textOf(answered.answer).includes(
            `Input validation error: Invalid arguments for tool ${target}: `,
          ),
        );
        assert.ok(textOf(answered.answer).includes(` at ${at}`));
      },
    );
  }

  it('BEHAVIOR_IMPLEMENTATION without behavior_definition: refused before any request', async () => {
    for (const behavior_definition of [undefined, '']) {
      const answered = await run(
        'answered',
        create('BEHAVIOR_IMPLEMENTATION', {
          ...fieldsOf('BEHAVIOR_IMPLEMENTATION'),
          behavior_definition,
        }),
      );
      assert.deepStrictEqual(answered.sent, []);
      assert.equal(answered.answer?.isError, true);
      assert.ok(
        textOf(answered.answer).includes('behavior_definition is required'),
      );
    }
  });

  it('BEHAVIOR_IMPLEMENTATION with behavior_definition: the one create sent', async () => {
    const held = await run(
      'pending',
      create('BEHAVIOR_IMPLEMENTATION', fieldsOf('BEHAVIOR_IMPLEMENTATION')),
    );
    assert.equal(held.sent.length, 1);
    assert.equal(held.sent[0].method, 'POST');
  });

  for (const [objectType, fullTool, fields] of CHAINS) {
    it(
      format(
        '%s: its create is a chain — refused before any request, pointing to %s',
        objectType,
        fullTool,
      ),
      async () => {
        const answered = await run('answered', create(objectType, fields));
        assert.deepStrictEqual(answered.sent, []);
        assert.equal(answered.answer?.isError, true);
        assert.ok(
          textOf(answered.answer).includes(
            `HandlerCreate does not create ${objectType}: its create is a chain of requests, not one — use ${fullTool} of the full set`,
          ),
        );
      },
    );
  }

  for (const objectType of ['LOCAL_TYPES', 'RUNTIME_DUMP', 'NO_SUCH_TYPE']) {
    it(
      format(
        '%s: a type with no create answers in the create route’s words',
        objectType,
      ),
      async () => {
        const answered = await run('answered', create(objectType, {}));
        assert.deepStrictEqual(answered.sent, []);
        assert.ok(
          textOf(answered.answer).includes(
            `Unsupported create for object_type: ${objectType}`,
          ),
        );
      },
    );
  }
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
  TRANSPORT: ['transport_type', 'target_system', 'owner', 'task_type'],
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
  PROGRAM: ['program_name', 'application', 'master_language'],
  INTERFACE: ['interface_name', 'master_language'],
  FUNCTION_GROUP: ['function_group_name', 'master_language'],
  FUNCTION_MODULE: ['function_module_name', 'function_group_name'],
  BEHAVIOR_DEFINITION: ['name', 'implementation_type', 'master_language'],
  BEHAVIOR_IMPLEMENTATION: ['class_name', 'behavior_definition'],
  METADATA_EXTENSION: ['name', 'master_language'],
  INCLUDE: ['include_name', 'master_language'],
  TABLE_TYPE: ['table_type_name', 'master_language'],
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
  // adt-clients' create config requires it; the class shell's request does
  // not carry it.
  BEHAVIOR_IMPLEMENTATION: ['behavior_definition'],
};

/** A value an accepted argument may take, so the create still builds. */
const SAMPLE: Record<string, unknown> = {
  transport_request: 'XXXK900001',
  transport_type: 'workbench',
  // Sent with the task's type change after the create, not in its POST.
  task_type: 'R',
  binding_variant: 'ODATA_V4_UI',
  package_type: 'development',
  implementation_type: 'Managed',
  record_changes: true,
  final: true,
  create_protected: true,
  master_language: 'EN',
};

/**
 * Every argument a caller of 18 could give `HandlerCreate` (its schema then)
 * and a few no create names: what the schema declares and no create sends is
 * refused; what it does not declare is refused by the parse too, naming it
 * (spec §3, the owner's decision for the create tools).
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

const schemaJson = listedJson(compactCreateSchema);

/** The arguments the schema declares. */
const DECLARED = new Set(Object.keys(schemaJson.properties ?? {}));

const kindOf = (name: string) =>
  KNOWN[name] ?? jsonFind(schemaJson, name)?.type;

/** The values `name`'s schema lists, when it lists them. */
const listedOf = (name: string) => jsonFind(schemaJson, name)?.enum;

/**
 * A value of `name`'s kind and its empty one (`false`, `0`, `''`, `[]`); for
 * an argument with listed values, the first of them (any other is refused by
 * the schema: see `ENUM_CASES`).
 */
function valuesOf(name: string): Array<[string, unknown]> {
  const listed = listedOf(name);
  if (listed !== undefined) {
    const first = listed[0];
    return [[`'${String(first)}'`, first]];
  }
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
  const cases: NotSentCase[] = [];
  for (const name of DECLARED) {
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

/** Per type, each argument of {@link KNOWN} the schema does not declare. */
const UNDECLARED_CASES = TYPES.flatMap(([objectType]) =>
  Object.keys(KNOWN)
    .filter((name) => !DECLARED.has(name))
    .map((name): NotSentCase => {
      const [shown, value] = valuesOf(name)[0] ?? ['undefined', undefined];
      return [objectType, name, shown, value];
    }),
);

/** Per type, every argument with listed values its create does not send. */
const ENUM_CASES = NOT_SENT_CASES.filter(
  ([, name]) => listedOf(name) !== undefined,
).map(([objectType, name]) => [objectType, name]);

const TYPE_FIELDS = new Map(TYPES);
const fieldsOf = (objectType: string) => TYPE_FIELDS.get(objectType) ?? {};

const NOT_SENT_WORDS =
  'leave it out; then HandlerLock, HandlerUpdate with the lock_handle, HandlerUnlock and HandlerActivate';

describe('HandlerCreate refuses an argument its create does not send', () => {
  withSystemContext();

  for (const [objectType, name, _shown, value] of NOT_SENT_CASES) {
    it(
      format(
        '%s with %s = %s: refused before any request, naming it',
        objectType,
        name,
        _shown,
      ),
      async () => {
        const answered = await run(
          'answered',
          create(objectType, { ...fieldsOf(objectType), [name]: value }),
        );
        assert.deepStrictEqual(answered.sent, []);
        assert.equal(answered.answer?.isError, true);
        assert.ok(
          textOf(answered.answer).includes(
            `HandlerCreate sends the create request alone: ${name} is not sent — ${NOT_SENT_WORDS}`,
          ),
        );
      },
    );
  }

  for (const [objectType, name] of ENUM_CASES) {
    it(
      format(
        '%s with %s outside its listed values: refused by the schema before any request, naming it',
        objectType,
        name,
      ),
      async () => {
        const answered = await run(
          'answered',
          create(objectType, {
            ...fieldsOf(objectType),
            [name]: 'NOT_A_LISTED_VALUE',
          }),
        );
        assert.deepStrictEqual(answered.sent, []);
        assert.equal(answered.answer?.isError, true);
        assert.ok(
          textOf(answered.answer).includes(
            'Input validation error: Invalid arguments for tool HandlerCreate: Invalid option',
          ),
        );
        assert.ok(textOf(answered.answer).includes(`at ${name}`));
      },
    );
  }

  for (const [objectType, name, _shown, value] of UNDECLARED_CASES) {
    it(
      format(
        '%s with %s = %s, which the schema does not declare: refused before any request, naming it',
        objectType,
        name,
        _shown,
      ),
      async () => {
        const answered = await run(
          'answered',
          create(objectType, { ...fieldsOf(objectType), [name]: value }),
        );
        assert.deepStrictEqual(answered.sent, []);
        assert.equal(answered.answer?.isError, true);
        assert.ok(
          textOf(answered.answer).includes(
            `${name} is not an argument of HandlerCreate`,
          ),
        );
      },
    );
  }

  // Named in the schema's order: the parse hands the handler its arguments so.
  it('names every argument it does not send', async () => {
    const answered = await run(
      'answered',
      create('STRUCTURE', {
        ...fieldsOf('STRUCTURE'),
        application: 'S',
        program_name: 'ZPROG_A',
      }),
    );
    assert.deepStrictEqual(answered.sent, []);
    assert.ok(
      textOf(answered.answer).includes(
        'HandlerCreate sends the create request alone: program_name, application are not sent',
      ),
    );
  });

  // A declared argument given as undefined is absent: `superclass` is
  // declared and DOMAIN's create does not send it. An undeclared one is
  // refused whatever its value — the strict parse reads the key.
  it('an argument given as undefined is absent', async () => {
    const held = await run(
      'pending',
      create('DOMAIN', { ...fieldsOf('DOMAIN'), superclass: undefined }),
    );
    assert.equal(held.sent.length, 1);
  });

  it('an undeclared argument given as undefined is refused, naming it', async () => {
    const answered = await run(
      'answered',
      create('DOMAIN', { ...fieldsOf('DOMAIN'), activate: undefined }),
    );
    assert.deepStrictEqual(answered.sent, []);
    assert.ok(
      textOf(answered.answer).includes(
        'activate is not an argument of HandlerCreate',
      ),
    );
  });

  for (const [objectType] of TYPES.map(([type]) => [type])) {
    it(
      format(
        '%s: every argument it accepts, given at once, still sends the one create',
        objectType,
      ),
      async () => {
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
        assert.equal(held.sent.length, 1);
        assert.equal(held.sent[0].method, 'POST');
      },
    );
  }

  for (const [objectType] of TYPES.map(([type]) => [type])) {
    it(
      format(
        '%s: each accepted string argument reaches the create request',
        objectType,
      ),
      async () => {
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
          assert.deepStrictEqual(
            { name, carried: wire.includes(marker) },
            {
              name,
              carried: true,
            },
          );
        }
      },
    );
  }
});

describe('the HandlerCreate schema and description', () => {
  it('create_only is not in the schema', () => {
    assert.ok(
      !Object.keys(schemaJson.properties ?? {}).includes('create_only'),
    );
  });

  it('names only what some create sends', () => {
    const sent = new Set([
      ...ACCEPTED_EVERYWHERE,
      ...Object.values(CARRIES).flat(),
    ]);
    assert.deepStrictEqual(
      Object.keys(schemaJson.properties ?? {}).filter(
        (name) => !sent.has(name),
      ),
      [],
    );
  });

  it('advertises per type only what that type’s create sends', () => {
    // Only the per-type list: from `object_type required:` to its end.
    const description: string = memberTokens('HandlerCreate', 'onprem');
    const start = description.indexOf('object_type required:');
    assert.ok(start >= 0);
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
    assert.deepStrictEqual(
      advertised.map(([type]) => type).sort(),
      TYPES.map(([type]) => type).sort(),
    );
    for (const [type, args] of advertised) {
      const accepted = new Set([...ACCEPTED_EVERYWHERE, ...CARRIES[type]]);
      assert.deepStrictEqual(
        {
          type,
          foreign: args.filter((arg) => !accepted.has(arg)),
        },
        { type, foreign: [] },
      );
    }
  });
});
