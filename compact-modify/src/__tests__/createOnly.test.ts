/**
 * `HandlerCreate` with `create_only: true` sends the create request of the
 * type's adt-clients `create()` alone — no validate, lock, write, unlock,
 * check or activate — so that a create can be recorded in batch mode, where
 * no request may wait for another's answer (spec §4.6).
 *
 * Real adt-clients code runs over a recording connection; nothing of it is
 * doubled. Three things are pinned per type of the create route:
 *
 * - an offered type sends exactly one `POST`, held open or answered (an empty
 *   `200`, a `404`) alike, and that request — method, address and body — is
 *   one the high create sends for the same arguments: the create's own;
 * - a type whose create sends more than one request refuses `create_only`
 *   before anything is sent, in the fixed words;
 * - without `create_only` (absent or `false`) the high create runs as it did:
 *   the same requests as the routed high handler called directly.
 */
import type {
  CompactHandler,
  CompactObjectType,
} from '@mcp-abap-adt/lib/compact-shared';
import { compactCreateSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleCreateOnly } from '@mcp-abap-adt/lib/handlers/write';
import { LOCK_SUCCESS_XML } from '../../../src/__tests__/helpers/recordingConnection';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../src/lib/systemContext';
import { compactWriteRouterMap } from '../handlers/compactWriteRoutes';
import { handleHandlerCreate } from '../handlers/handleHandlerCreate';

type Sent = { method: string; url: string; data?: unknown };
type Mode = 'pending' | 'answered' | 'not-found';
type Answer = { isError?: boolean; content?: Array<{ text?: string }> };

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
        const error = new Error(
          'Request failed with status code 404',
        ) as Error & { response?: unknown };
        error.response = {
          status: 404,
          statusText: 'Not Found',
          data: '',
          headers: {},
        };
        throw error;
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

/**
 * What the high create requires beyond what its create request carries (its
 * later steps' input): given to it alone, and refused beside create_only.
 */
const HIGH_ONLY: Record<string, Record<string, unknown>> = {
  STRUCTURE: { fields: [{ name: 'FIELD_A', data_type: 'CHAR', length: 10 }] },
  BEHAVIOR_DEFINITION: { root_entity: 'ZBDEF_A' },
  BEHAVIOR_IMPLEMENTATION: { behavior_definition: 'ZBDEF_A' },
};

/** The high create the create route runs for `objectType`, called directly. */
const highCreate =
  (objectType: string, fields: Record<string, unknown>) =>
  (context: HandlerContext) =>
    (
      compactWriteRouterMap[objectType as CompactObjectType]
        .create as CompactHandler
    )(context, {
      object_type: objectType,
      ...fields,
      ...HIGH_ONLY[objectType],
    });

/** The types `create_only` is offered for, each with arguments its create needs. */
const OFFERED: Array<[string, Record<string, unknown>]> = [
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

/** The types whose create sends more than one request: create_only is refused. */
const REFUSED: Array<[string, Record<string, unknown>]> = [
  [
    'UNIT_TEST',
    { class_name: 'ZCL_A', test_class_source: 'CLASS ltc DEFINITION.' },
  ],
  [
    'CDS_UNIT_TEST',
    {
      cds_view_name: 'ZDDL_A',
      class_name: 'ZCL_T',
      package_name: 'ZPKG_A',
      test_class_source: 'CLASS ltc DEFINITION.',
    },
  ],
];

const createOnly =
  (object_type: string, fields: Record<string, unknown>) =>
  (context: HandlerContext) =>
    handleHandlerCreate(context, {
      object_type,
      ...fields,
      create_only: true,
    } as never);

describe('HandlerCreate create_only', () => {
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  it('offers create_only for every type of the create route but those refused', () => {
    const withCreate = Object.entries(compactWriteRouterMap)
      .filter(([, routes]) => routes.create !== undefined)
      .map(([type]) => type)
      .sort();
    expect(withCreate).toEqual(
      [...OFFERED, ...REFUSED].map(([type]) => type).sort(),
    );
  });

  it.each(OFFERED)(
    '%s: create_only sends exactly one POST, the create’s, nothing else',
    async (objectType, fields) => {
      const held = await run('pending', createOnly(objectType, fields));
      const answered = await run(
        'answered',
        createOnly(objectType, fields),
        BODY[objectType],
      );
      const refused = await run('not-found', createOnly(objectType, fields));
      const high = await run(
        'answered',
        highCreate(objectType, fields),
        BODY[objectType],
      );

      expect(held.sent).toHaveLength(1);
      expect(held.sent[0].method).toBe('POST');
      expect(answered.sent).toEqual(held.sent);
      expect(refused.sent).toEqual(held.sent);
      expect(answered.answer?.isError).not.toBe(true);
      // The one request is the create the high create sends: no validation,
      // no lock — a request of the high chain, byte for byte.
      expect(held.sent[0].url).not.toContain('validation');
      expect(held.sent[0].url).not.toContain('_action=');
      expect(high.sent).toContainEqual(held.sent[0]);
    },
  );

  it.each(REFUSED)(
    '%s: a type whose create sends more refuses create_only before sending',
    async (objectType, fields) => {
      const answered = await run('answered', createOnly(objectType, fields));
      expect(answered.sent).toEqual([]);
      expect(answered.answer?.isError).toBe(true);
      expect(answered.answer?.content?.[0]?.text).toContain(
        `create_only is not available for ${objectType}: its create sends more than one request`,
      );
    },
  );

  it.each([...OFFERED, ...REFUSED])(
    '%s: without create_only the high create runs unchanged',
    async (objectType, fields) => {
      const high = await run('answered', highCreate(objectType, fields));
      const absent = await run('answered', (context) =>
        handleHandlerCreate(context, {
          object_type: objectType,
          ...fields,
          ...HIGH_ONLY[objectType],
        } as never),
      );
      const off = await run('answered', (context) =>
        handleHandlerCreate(context, {
          object_type: objectType,
          ...fields,
          ...HIGH_ONLY[objectType],
          create_only: false,
        } as never),
      );
      expect(absent.sent).toEqual(high.sent);
      expect(off.sent).toEqual(high.sent);
      expect(absent.answer).toEqual(high.answer);
    },
  );

  it('a type with no create answers as the create route does, create_only or not', async () => {
    const plain = await run('answered', (context) =>
      handleHandlerCreate(context, {
        object_type: 'LOCAL_TYPES',
        class_name: 'ZCL_A',
      } as never),
    );
    const only = await run(
      'answered',
      createOnly('LOCAL_TYPES', {
        class_name: 'ZCL_A',
      }),
    );
    expect(only.sent).toEqual([]);
    expect(only.answer).toEqual(plain.answer);
  });
});

/**
 * Beside `create_only`, an argument the create does not send is refused, not
 * dropped (the controller's ruling). What each type's create request carries,
 * as measured — kept here independently of the handler's own list, so a list
 * widened there turns this red.
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

/** Accepted for every type: the ruling's common three, and what is not a request argument. */
const ACCEPTED_EVERYWHERE = [
  'object_type',
  'create_only',
  'detail',
  'transport_request',
  'package_name',
  'description',
];

/**
 * Accepted though the request was measured not to carry them — the ruling's
 * common three where adt-clients' create does not send them. Named so the
 * probe below does not expect them on the wire.
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

const schemaProperties = compactCreateSchema.properties as Record<
  string,
  { type?: string }
>;

/** Arguments the compact create does not name, which a caller may still send. */
const UNNAMED = ['source_code', 'response_format'];

/** A value of `name`'s kind and its empty one (`false`, `0`, `''`, `[]`). */
function valuesOf(name: string): Array<[string, unknown]> {
  switch (schemaProperties[name]?.type) {
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

/** Per offered type, every argument the create does not send, with each value tried. */
function notSentCases(objectType: string): NotSentCase[] {
  const accepted = new Set([
    ...ACCEPTED_EVERYWHERE,
    ...CARRIES[objectType],
    'activate',
  ]);
  const cases: NotSentCase[] = [];
  for (const name of [...Object.keys(schemaProperties), ...UNNAMED]) {
    if (accepted.has(name)) continue;
    for (const [shown, value] of valuesOf(name)) {
      cases.push([objectType, name, shown, value]);
    }
  }
  return cases;
}

const NOT_SENT_CASES = OFFERED.flatMap(([objectType]) =>
  notSentCases(objectType),
);

const OFFERED_FIELDS = new Map(OFFERED);

describe('HandlerCreate create_only beside an argument its create does not send', () => {
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  const fieldsOf = (objectType: string) => OFFERED_FIELDS.get(objectType) ?? {};

  it.each(NOT_SENT_CASES)(
    '%s with %s = %s: refused before any request, naming it',
    async (objectType, name, _shown, value) => {
      const answered = await run(
        'answered',
        createOnly(objectType, { ...fieldsOf(objectType), [name]: value }),
      );
      expect(answered.sent).toEqual([]);
      expect(answered.answer?.isError).toBe(true);
      expect(answered.answer?.content?.[0]?.text).toContain(
        `create_only sends the create alone: ${name} is not sent — leave it out, or create without create_only`,
      );
    },
  );

  it.each(OFFERED.map(([type]) => [type]))(
    '%s with activate true: refused before any request; activate false is accepted',
    async (objectType) => {
      const on = await run(
        'answered',
        createOnly(objectType, { ...fieldsOf(objectType), activate: true }),
      );
      expect(on.sent).toEqual([]);
      expect(on.answer?.content?.[0]?.text).toContain(
        'create_only sends the create alone: activate is not sent — leave it out, or create without create_only',
      );
      const off = await run(
        'pending',
        createOnly(objectType, { ...fieldsOf(objectType), activate: false }),
      );
      expect(off.sent).toHaveLength(1);
    },
  );

  it('names every argument it does not send', async () => {
    const answered = await run(
      'answered',
      createOnly('STRUCTURE', {
        ...fieldsOf('STRUCTURE'),
        fields: [],
        activate: true,
      }),
    );
    expect(answered.sent).toEqual([]);
    expect(answered.answer?.content?.[0]?.text).toContain(
      'create_only sends the create alone: fields, activate are not sent',
    );
  });

  it.each(OFFERED.map(([type]) => [type]))(
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
      const held = await run('pending', createOnly(objectType, fields));
      expect(held.sent).toHaveLength(1);
      expect(held.sent[0].method).toBe('POST');
    },
  );

  it.each(OFFERED.map(([type]) => [type]))(
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
          createOnly(objectType, { ...fieldsOf(objectType), [name]: marker }),
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

describe('create_only and what only the high create needs', () => {
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  it.each([
    ['BEHAVIOR_DEFINITION', 'root_entity'],
    ['BEHAVIOR_IMPLEMENTATION', 'behavior_definition'],
    ['CLASS', 'abstract'],
  ])(
    '%s: create_only neither needs nor takes %s, which its create does not send',
    async (objectType, name) => {
      const fields = OFFERED_FIELDS.get(objectType) ?? {};
      expect(fields[name]).toBeUndefined();
      const without = await run('pending', createOnly(objectType, fields));
      expect(without.sent).toHaveLength(1);
      const value = name === 'abstract' ? true : 'ZBDEF_A';
      const given = await run(
        'answered',
        createOnly(objectType, { ...fields, [name]: value }),
      );
      expect(given.sent).toEqual([]);
      expect(given.answer?.content?.[0]?.text).toContain(
        `create_only sends the create alone: ${name} is not sent`,
      );
    },
  );

  it.each([
    ['BEHAVIOR_DEFINITION', 'root_entity'],
    ['BEHAVIOR_IMPLEMENTATION', 'behavior_definition'],
  ])('%s: the high create still requires %s', async (objectType, name) => {
    const answered = await run('answered', (context) =>
      handleHandlerCreate(context, {
        object_type: objectType,
        ...(OFFERED_FIELDS.get(objectType) ?? {}),
      } as never),
    );
    expect(answered.sent).toEqual([]);
    expect(answered.answer?.isError).toBe(true);
    expect(name in (HIGH_ONLY[objectType] ?? {})).toBe(true);
  });
});

describe('handleCreateOnly and a type with no create', () => {
  it.each(['LOCAL_TYPES', 'RUNTIME_DUMP', 'NO_SUCH_TYPE'])(
    "%s: the create route's own words, not the more-than-one-request refusal",
    async (objectType) => {
      const direct = await run(
        'answered',
        (context) =>
          handleCreateOnly(context, {
            object_type: objectType,
            create_only: true,
          }) as Promise<unknown>,
      );
      expect(direct.sent).toEqual([]);
      expect(direct.answer?.content?.[0]?.text).toContain(
        `Unsupported create for object_type: ${objectType}`,
      );
      expect(direct.answer?.content?.[0]?.text).not.toContain(
        'more than one request',
      );
      const routed = await run('answered', createOnly(objectType, {}));
      expect(routed.answer).toEqual(direct.answer);
    },
  );
});
