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

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { format, isDeepStrictEqual } from 'node:util';
import {
  compactLockSchema,
  compactUpdateSchema,
  memberTokens,
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
import { setSystemContext } from '../../../src/__tests__/helpers/processSystemContext';
import { LOCK_SUCCESS_XML } from '../../../src/__tests__/helpers/recordingConnection';
import { resetSystemContextCache } from '../../../src/lib/systemContext';
import { compactWriteRouterMap } from '../handlers/compactWriteRoutes';
import {
  TOOL_DEFINITION as HandlerLock,
  handleHandlerLock,
  handleHandlerLock as lockOrUnlock,
} from '../handlers/handleHandlerLock';
import {
  handleHandlerUpdate,
  TOOL_DEFINITION,
} from '../handlers/handleHandlerUpdate';

/** An unlock, as the merged HandlerLock takes it: `action: 'unlock'`. */
const handleHandlerUnlock = (
  context: Parameters<typeof lockOrUnlock>[0],
  args: Omit<Parameters<typeof lockOrUnlock>[1], 'action'>,
) => lockOrUnlock(context, { ...args, action: 'unlock' });

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

/**
 * The sub-resources: one operation under the caller's lock each — the
 * settings' patch (its read and its PUT), the text elements' one PUT per
 * part given — and no lock, unlock or activation of their own.
 */
const SUB_RESOURCES: Array<[string, Record<string, unknown>]> = [
  ['TABLE_SETTINGS', { table_name: 'ZTAB_A', data_class: 'APPL1' }],
  [
    'PROGRAM_TEXT_ELEMENTS',
    {
      program_name: 'ZPROG_A',
      symbols: [{ key: '001', text: 'Text', max_length: 10 }],
    },
  ],
  [
    'FUNCTION_GROUP_TEXT_ELEMENTS',
    {
      function_group_name: 'ZFG_A',
      symbols: [{ key: '001', text: 'Text', max_length: 10 }],
    },
  ],
  [
    'CLASS_TEXT_ELEMENTS',
    {
      class_name: 'ZCL_A',
      symbols: [{ key: '001', text: 'Text', max_length: 10 }],
    },
  ],
];

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
    assert.deepStrictEqual(
      withUpdate,
      [...new Set([...TYPES, ...SUB_RESOURCES].map(([t]) => t))].sort(),
    );
  });

  for (const [objectType, fields] of SUB_RESOURCES) {
    it(
      format(
        '%s: its write alone, under the given lock_handle: no lock, unlock or activation',
        objectType,
      ),
      async () => {
        const answered = await run(
          'answered',
          update(objectType, underLock(fields)),
        );
        assert.ok(answered.sent.length > 0);
        for (const request of answered.sent) {
          assert.ok(!request.url.includes('_action='), request.url);
          assert.ok(!request.url.includes('/activation'), request.url);
          if (request.method === 'PUT') {
            assert.ok(request.url.includes(`lockHandle=${LOCK}`));
          }
        }
      },
    );
  }

  for (const [objectType, fields] of TYPES.filter(notModule)) {
    it(
      format(
        '%s: exactly one request, under the given lock_handle, the same held, answered or 404',
        objectType,
      ),
      async () => {
        const call = update(objectType, underLock(fields));
        const held = await run('pending', call);
        const answered = await run('answered', call);
        const notFound = await run('not-found', call);

        assert.equal(held.sent.length, 1);
        const [write] = held.sent;
        assert.equal(
          write.method,
          objectType === 'SERVICE_BINDING' ? 'POST' : 'PUT',
        );
        assert.ok(!write.url.includes('_action='));
        // No read after the write: answered, nothing more goes out.
        assert.deepStrictEqual(answered.sent, held.sent);
        assert.deepStrictEqual(notFound.sent, held.sent);
        assert.equal(notFound.answer?.isError, true);
        if (objectType === 'SERVICE_BINDING') {
          // The publication request carries no transport request.
          assert.ok(!write.url.includes('corrNr'));
        } else {
          assert.ok(write.url.includes(`lockHandle=${LOCK}`));
          assert.ok(write.url.includes(`corrNr=${TRANSPORT}`));
          assert.notEqual(answered.answer?.isError, true);
        }
      },
    );
  }

  for (const [objectType, fields] of DOCUMENTS) {
    it(
      format('%s: the body is source_code byte for byte, no read', objectType),
      async () => {
        const answered = await run(
          'answered',
          update(objectType, underLock(fields)),
        );
        assert.equal(answered.sent.length, 1);
        assert.equal(answered.sent[0].method, 'PUT');
        assert.equal(answered.sent[0].data, fields.source_code);
        assert.notEqual(answered.answer?.isError, true);
      },
    );
  }

  it('FUNCTION_MODULE: the metadata read at its group, then the one write under the given lock_handle, its body the source byte for byte (#2)', async () => {
    const [, fields] = SOURCES.find(([type]) => !notModule([type, 0])) ?? [];
    const call = update('FUNCTION_MODULE', underLock(fields ?? {}));
    const held = await run('pending', call);
    const answered = await run('answered', call);
    const notFound = await run('not-found', call);

    assert.deepStrictEqual(
      held.sent.map(({ method, url }) => `${method} ${url}`),
      [`GET ${MODULE_METADATA}`],
    );
    assert.deepStrictEqual(
      answered.sent.map(({ method }) => method),
      ['GET', 'PUT'],
    );
    const write = answered.sent[1];
    assert.ok(write?.url.includes(`lockHandle=${LOCK}`));
    assert.ok(write?.url.includes(`corrNr=${TRANSPORT}`));
    assert.equal(write?.data, 'source text');
    assert.notEqual(answered.answer?.isError, true);
    // SAP refused the metadata read: nothing is written.
    assert.deepStrictEqual(notFound.sent, held.sent);
    assert.equal(notFound.answer?.isError, true);
  });

  for (const [objectType, fields] of SOURCES.filter(notModule)) {
    it(
      format('%s: the body is the given source, byte for byte', objectType),
      async () => {
        const held = await run(
          'pending',
          update(objectType, underLock(fields)),
        );
        assert.equal(held.sent[0]?.data, 'source text');
      },
    );
  }

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
    assert.ok(one.sent[0].url.includes('publish'));
    assert.ok(two.sent[0].url.includes('unpublish'));
  });

  it('an OData V2 publication carries service_name and service_version', async () => {
    const [, v2] = PUBLICATIONS[1];
    const held = await run(
      'pending',
      update('SERVICE_BINDING', underLock({ ...v2, service_version: '0002' })),
    );
    const wire = JSON.stringify(held.sent[0]);
    assert.ok(wire.includes('ZSRV_A'));
    assert.ok(wire.includes('0002'));
  });

  for (const [objectType, fields] of TYPES) {
    it(
      format('%s: without lock_handle refused before any request', objectType),
      async () => {
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
          assert.deepStrictEqual(answered.sent, []);
          assert.equal(answered.answer?.isError, true);
          assert.ok(textOf(answered.answer).includes(words));
        }
      },
    );
  }

  for (const [objectType, fields] of DOCUMENTS) {
    it(
      format('%s: without source_code refused before any request', objectType),
      async () => {
        const answered = await run(
          'answered',
          update(objectType, underLock({ ...fields, source_code: undefined })),
        );
        assert.deepStrictEqual(answered.sent, []);
        assert.ok(textOf(answered.answer).includes('source_code is required'));
      },
    );
  }

  // A type whose write is a target tool's is parsed with that tool's
  // schema: a name it requires, absent, is refused in its words, naming the
  // target, before any request (spec §3).
  for (const [objectType, name, target] of [
    ['TABLE', 'table_name', 'UpdateTableLow'],
    ['STRUCTURE', 'structure_name', 'UpdateStructureLow'],
    ['DDL', 'ddl_name', 'UpdateDdlLow'],
    ['CLASS', 'class_name', 'UpdateClassLow'],
    ['PROGRAM', 'program_name', 'UpdateProgramLow'],
    ['INTERFACE', 'interface_name', 'UpdateInterfaceLow'],
    ['FUNCTION_MODULE', 'function_module_name', 'UpdateFunctionModuleLow'],
    ['BEHAVIOR_DEFINITION', 'name', 'UpdateBehaviorDefinitionLow'],
    ['METADATA_EXTENSION', 'name', 'UpdateMetadataExtensionLow'],
  ]) {
    it(
      format(
        "%s without %s: refused by %s's schema, before any request",
        objectType,
        name,
        target,
      ),
      async () => {
        const fields = TYPES.find(([type]) => type === objectType)?.[1] ?? {};
        const answered = await run(
          'answered',
          update(objectType, underLock({ ...fields, [name]: undefined })),
        );
        assert.deepStrictEqual(answered.sent, []);
        assert.equal(answered.answer?.isError, true);
        assert.ok(
          textOf(answered.answer).includes(
            `Input validation error: Invalid arguments for tool ${target}: `,
          ),
        );
        assert.ok(textOf(answered.answer).includes(` at ${name}`));
      },
    );
  }

  for (const objectType of ['TRANSPORT', 'RUNTIME_DUMP', 'NO_SUCH_TYPE']) {
    it(
      format(
        '%s: a type with no update answers in the update route’s words',
        objectType,
      ),
      async () => {
        const answered = await run(
          'answered',
          update(objectType, { lock_handle: LOCK }),
        );
        assert.deepStrictEqual(answered.sent, []);
        assert.ok(
          textOf(answered.answer).includes(
            `Unsupported update for object_type: ${objectType}`,
          ),
        );
      },
    );
  }
});

/** The types `part` is taken by, as the refusal names them. */
const PART_WORDS =
  'part is taken only by INCLUDE (source or metadata); leave it out for';

describe('HandlerUpdate part: the include’s source or its metadata', () => {
  withSystemContext();

  const include = { include_name: 'ZINCL_A', source_code: 'source text' };

  for (const [_label, part] of [
    ['absent', {}],
    ['source', { part: 'source' }],
  ] satisfies [string, Record<string, unknown>][]) {
    it(format('INCLUDE part %s: one PUT of the source', _label), async () => {
      const held = await run(
        'pending',
        update('INCLUDE', underLock({ ...include, ...part })),
      );
      assert.equal(held.sent.length, 1);
      assert.equal(held.sent[0].method, 'PUT');
      assert.ok(
        held.sent[0].url.includes('/programs/includes/zincl_a/source/main'),
      );
    });
  }

  it('INCLUDE part metadata: one PUT of the metadata document, as given', async () => {
    const document = DOCUMENT('include:abapInclude');
    const held = await run(
      'pending',
      update(
        'INCLUDE',
        underLock({ ...include, part: 'metadata', source_code: document }),
      ),
    );
    assert.equal(held.sent.length, 1);
    assert.equal(held.sent[0].method, 'PUT');
    assert.ok(held.sent[0].url.includes('/programs/includes/zincl_a?'));
    assert.ok(!held.sent[0].url.includes('/source/main'));
    assert.equal(held.sent[0].data, document);
  });

  // A part the schema does not list is refused by the parse, in its words.
  it('INCLUDE with a part of no such name: refused before any request', async () => {
    const answered = await run(
      'answered',
      update('INCLUDE', underLock({ ...include, part: 'urls' })),
    );
    assert.deepStrictEqual(answered.sent, []);
    assert.equal(answered.answer?.isError, true);
    assert.ok(
      textOf(answered.answer).includes(
        'Input validation error: Invalid arguments for tool HandlerUpdate: Invalid option: expected one of "source"|"metadata" at part',
      ),
    );
  });

  const others = TYPES.filter(([type]) => type !== 'INCLUDE');

  for (const [objectType, part, fields] of others.flatMap(([type, fields]) =>
    ['metadata', 'source'].map((part) => [type, part, fields] as const),
  )) {
    it(
      format(
        '%s with part %s: refused before any request, naming the types that take it',
        objectType,
        part,
      ),
      async () => {
        const answered = await run(
          'answered',
          update(objectType, underLock({ ...fields, part })),
        );
        assert.deepStrictEqual(answered.sent, []);
        assert.equal(answered.answer?.isError, true);
        assert.ok(
          textOf(answered.answer).includes(`${PART_WORDS} ${objectType}`),
        );
      },
    );
  }

  it('part declares no schema default', () => {
    const part = schemaProperties.part;
    assert.ok(typeof part === 'object');
    const { description, ...rest } = part;
    assert.equal(typeof description, 'string');
    assert.deepStrictEqual(rest, {
      type: 'string',
      enum: ['source', 'metadata'],
    });
  });
});

const schemaProperties = listedJson(compactUpdateSchema).properties ?? {};

describe('the HandlerUpdate schema and description', () => {
  it('requires object_type and lock_handle', () => {
    assert.deepStrictEqual([...declaredRequired(compactUpdateSchema)].sort(), [
      'lock_handle',
      'object_type',
    ]);
  });

  for (const name of [
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
  ]) {
    it(format('%s is not in the schema', name), () => {
      assert.ok(!Object.keys(schemaProperties).includes(name));
    });
  }

  it('names transport_request for each type whose write sends it, and only those', () => {
    const description: string = memberTokens('HandlerUpdate', 'onprem');
    for (const [type] of TYPES) {
      const args = description.match(
        new RegExp(`\\b${type}\\(([^)]*)\\)`),
      )?.[1];
      assert.deepStrictEqual(
        { type, transport: args?.includes('transport_request') },
        {
          type,
          transport: type !== 'SERVICE_BINDING',
        },
      );
    }
  });

  it('names no other tool', () => {
    assert.doesNotMatch(TOOL_DEFINITION.description, /Handler[A-Z]/);
  });

  it('transport_request is in the schema', () => {
    assert.ok(Object.keys(schemaProperties).includes('transport_request'));
  });

  it('desired_publication_state names only states a request sets', () => {
    assert.deepStrictEqual(
      (
        schemaProperties.desired_publication_state as {
          enum: readonly string[];
        }
      ).enum,
      ['published', 'unpublished'],
    );
  });

  it('advertises every type it writes, with only schema arguments', () => {
    const description: string = memberTokens('HandlerUpdate', 'onprem');
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
      [...new Set([...TYPES, ...SUB_RESOURCES].map(([t]) => t))].sort(),
    );
    for (const [type, args] of advertised) {
      assert.deepStrictEqual(
        {
          type,
          foreign: args.filter((arg) => !(arg in schemaProperties)),
        },
        { type, foreign: [] },
      );
    }
  });
});

describe('HandlerLock and HandlerUnlock take the service types', () => {
  withSystemContext();

  it('their schemas name the service types', () => {
    for (const schema of [compactLockSchema]) {
      const named = jsonAt(listedJson(schema), 'object_type').enum;
      assert.ok(Array.isArray(named));
      for (const type of ['SERVICE_DEFINITION', 'SERVICE_BINDING']) {
        assert.ok(named.some((e) => isDeepStrictEqual(e, type)));
      }
    }
  });

  for (const [object_type, object_name, uri] of [
    ['INCLUDE', 'ZINCL_A', '/sap/bc/adt/programs/includes/zincl_a'],
    ['TABLE_TYPE', 'ZTTYP_A', '/sap/bc/adt/ddic/tabletypes/zttyp_a'],
  ] as const) {
    it(
      format('%s: the lock is one LOCK, the unlock one UNLOCK', object_type),
      async () => {
        const locked = await run('answered', (context) =>
          handleHandlerLock(context, { object_type, object_name }),
        );
        assert.equal(locked.sent.length, 1);
        assert.ok(locked.sent[0].url.toLowerCase().includes(uri));
        assert.ok(locked.sent[0].url.includes('_action=LOCK'));
        assert.notEqual(locked.answer?.isError, true);
        assert.ok(textOf(locked.answer).includes('lock_handle'));

        const unlocked = await run('answered', (context) =>
          handleHandlerUnlock(context, {
            object_type,
            object_name,
            lock_handle: LOCK,
          }),
        );
        assert.equal(unlocked.sent.length, 1);
        assert.ok(unlocked.sent[0].url.toLowerCase().includes(uri));
        assert.ok(unlocked.sent[0].url.includes('_action=UNLOCK'));
        assert.notEqual(unlocked.answer?.isError, true);
      },
    );
  }

  for (const [_tool, variants] of [
    ['HandlerLock', HandlerLock.variants],
  ] satisfies [string, typeof HandlerLock.variants][]) {
    it(
      format(
        '%s locks a table type on both variants, an include on premise only',
        _tool,
      ),
      () => {
        const onprem =
          jsonAt(listedJson(variants.onprem.inputSchema), 'object_type').enum ??
          [];
        const cloud =
          jsonAt(listedJson(variants.cloud.inputSchema), 'object_type').enum ??
          [];
        for (const type of ['INCLUDE', 'TABLE_TYPE']) {
          assert.ok(onprem.some((e) => isDeepStrictEqual(e, type)));
        }
        assert.ok(cloud.includes('TABLE_TYPE'));
        assert.ok(!cloud.includes('INCLUDE'));
      },
    );
  }

  it('HandlerUpdate’s schema names every type it writes', () => {
    const named = jsonAt(listedJson(compactUpdateSchema), 'object_type').enum;
    assert.ok(Array.isArray(named));
    for (const type of new Set(TYPES.map(([t]) => t))) {
      assert.ok(named.some((e) => isDeepStrictEqual(e, type)));
    }
  });

  for (const [object_type, object_name, uri] of [
    ['SERVICE_DEFINITION', 'ZSRVD_A', '/sap/bc/adt/ddic/srvd/sources/zsrvd_a'],
    [
      'SERVICE_BINDING',
      'ZSRVB_A',
      '/sap/bc/adt/businessservices/bindings/zsrvb_a',
    ],
  ]) {
    it(
      format('%s: the lock is one LOCK, the unlock one UNLOCK', object_type),
      async () => {
        const locked = await run('answered', (context) =>
          handleHandlerLock(context, {
            object_type: object_type as never,
            object_name,
          }),
        );
        assert.equal(locked.sent.length, 1);
        assert.ok(locked.sent[0].url.toLowerCase().includes(uri));
        assert.ok(locked.sent[0].url.includes('_action=LOCK'));
        assert.notEqual(locked.answer?.isError, true);
        assert.ok(textOf(locked.answer).includes('lock_handle'));

        const unlocked = await run('answered', (context) =>
          handleHandlerUnlock(context, {
            object_type: object_type as never,
            object_name,
            lock_handle: LOCK,
          }),
        );
        assert.equal(unlocked.sent.length, 1);
        assert.ok(unlocked.sent[0].url.toLowerCase().includes(uri));
        assert.ok(unlocked.sent[0].url.includes('_action=UNLOCK'));
        assert.notEqual(unlocked.answer?.isError, true);
      },
    );
  }

  it('a service binding open in an editing session: its LOCK’s 403 is a lock with an empty handle, and the publication runs under it', async () => {
    const locked = await run('forbidden', (context) =>
      handleHandlerLock(context, {
        object_type: 'SERVICE_BINDING' as never,
        object_name: 'ZSRVB_A',
      }),
    );
    assert.equal(locked.sent.length, 1);
    assert.notEqual(locked.answer?.isError, true);
    assert.equal(JSON.parse(textOf(locked.answer)).lock_handle, '');

    const [, publish] = PUBLICATIONS[0];
    const held = await run(
      'pending',
      update('SERVICE_BINDING', { ...publish, lock_handle: '' }),
    );
    assert.equal(held.sent.length, 1);
    assert.equal(held.sent[0].method, 'POST');
  });

  for (const [_where, heldLocks] of [
    ['holding the lock of the other cases', undefined],
    ['with held locks (Streamable HTTP)', new HeldLocks()],
  ]) {
    it(
      format(
        'unlocking a service binding with an empty lock_handle, %s: nothing to unlock, nothing sent',
        _where,
      ),
      async () => {
        const answered = await run('answered', (context) =>
          handleHandlerUnlock(
            {
              ...context,
              ...(heldLocks ? { heldLocks } : {}),
            } as HandlerContext,
            {
              object_type: 'SERVICE_BINDING' as never,
              object_name: 'ZSRVB_A',
              lock_handle: '',
            },
          ),
        );
        assert.deepStrictEqual(answered.sent, []);
        assert.notEqual(answered.answer?.isError, true);
        assert.ok(
          textOf(answered.answer).includes(
            'Nothing to unlock: the service binding holds no lock handle',
          ),
        );
      },
    );
  }

  it('a 403 LOCK of another type stays a refusal', async () => {
    const refused = await run('forbidden', (context) =>
      handleHandlerLock(context, {
        object_type: 'SERVICE_DEFINITION' as never,
        object_name: 'ZSRVD_A',
      }),
    );
    assert.equal(refused.answer?.isError, true);
  });

  it('a refused LOCK of a service binding is answered as SAP sent it', async () => {
    const refused = await run('not-found', (context) =>
      handleHandlerLock(context, {
        object_type: 'SERVICE_BINDING' as never,
        object_name: 'ZSRVB_A',
      }),
    );
    assert.equal(refused.sent.length, 1);
    assert.equal(refused.answer?.isError, true);
    assert.ok(textOf(refused.answer).includes('404'));
  });
});
