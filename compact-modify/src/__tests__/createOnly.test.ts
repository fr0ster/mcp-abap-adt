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
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
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

/** The high create the create route runs for `objectType`, called directly. */
const highCreate =
  (objectType: string, fields: Record<string, unknown>) =>
  (context: HandlerContext) =>
    (
      compactWriteRouterMap[objectType as CompactObjectType]
        .create as CompactHandler
    )(context, { object_type: objectType, ...fields });

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
  [
    'STRUCTURE',
    {
      structure_name: 'ZSTRU_A',
      package_name: 'ZPKG_A',
      // The high create refuses a structure with no field; the create
      // request carries none, so create_only sends the same without them.
      fields: [{ name: 'FIELD_A', data_type: 'CHAR', length: 10 }],
    },
  ],
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
      root_entity: 'ZBDEF_A',
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
        } as never),
      );
      const off = await run('answered', (context) =>
        handleHandlerCreate(context, {
          object_type: objectType,
          ...fields,
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
