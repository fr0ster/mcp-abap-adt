/**
 * Full-set reads: one `Get<Type>` per type, `part: 'source' | 'metadata'`
 * (default `source`), one ADT request per call, the answer carrying only the
 * document asked for — the same tool in the full set and in `-ro`, and no
 * `Read<Type>` served anywhere.
 *
 * Real adt-clients code runs against a counting connection
 * (`batchHarness.ts`): held open, answered with a document, and answered
 * `404`, each part sends exactly one request.
 */

import { compactModifyEntries } from '../../../../compact-modify/src';
import { compactReadOnlyEntries } from '../../../../compact-readonly-entries/src';
import { TOOL_DEFINITION as GET_INCLUDE } from '../../../handlers/include/readonly/handleGetInclude';
import type {
  HandlerContext,
  HandlerEntry,
  IHandlerGroup,
} from '../../../lib/handlers/interfaces';
import { noConnectionContext } from '../../../lib/handlers/registry/expositionRegistry';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import {
  compactReadOnlyToolSetOf,
  compactToolSetOf,
  fullReadOnlyToolSet,
  fullToolSet,
  type ToolSet,
} from '../../../lib/toolSet';
import { type Mode, runCase, servedTools } from '../../helpers/batchHarness';
import { jsonAt, listedJson } from '../../helpers/listedJson';
import { silentLogger } from '../../helpers/lowToCompact';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

interface SourceType {
  tool: string;
  args: Record<string, unknown>;
  /** The one source request's path fragment; absent when it is the object's own URI. */
  sourcePath?: string;
}

const SOURCE_TYPES: SourceType[] = [
  {
    tool: 'GetClass',
    args: { class_name: 'CLAS_A' },
    sourcePath: '/oo/classes/clas_a/source/main',
  },
  {
    tool: 'GetInterface',
    args: { interface_name: 'INTF_A' },
    sourcePath: '/oo/interfaces/intf_a/source/main',
  },
  {
    tool: 'GetProgram',
    args: { program_name: 'PROG_A' },
    sourcePath: '/programs/programs/prog_a/source/main',
  },
  {
    tool: 'GetTable',
    args: { table_name: 'TAB_A' },
    sourcePath: '/ddic/tables/tab_a/source/main',
  },
  {
    tool: 'GetStructure',
    args: { structure_name: 'STRU_A' },
    sourcePath: '/ddic/structures/stru_a/source/main',
  },
  {
    tool: 'GetDdl',
    args: { ddl_name: 'DDL_A' },
    sourcePath: '/ddic/ddl/sources/ddl_a/source/main',
  },
  {
    tool: 'GetServiceDefinition',
    args: { service_definition_name: 'SRVD_A' },
    sourcePath: '/ddic/srvd/sources/srvd_a/source/main',
  },
  {
    tool: 'GetServiceBinding',
    args: { service_binding_name: 'SRVB_A' },
  },
  {
    tool: 'GetBehaviorDefinition',
    args: { behavior_definition_name: 'BDEF_A' },
    sourcePath: '/bo/behaviordefinitions/bdef_a/source/main',
  },
  {
    tool: 'GetBehaviorImplementation',
    args: { behavior_implementation_name: 'BIMP_A' },
    sourcePath: '/oo/classes/bimp_a/source/main',
  },
  {
    tool: 'GetMetadataExtension',
    args: { metadata_extension_name: 'DDLX_A' },
    sourcePath: '/ddic/ddlx/sources/ddlx_a/source/main',
  },
  {
    tool: 'GetFunctionModule',
    args: { function_module_name: 'FM_A', function_group_name: 'FUGR_A' },
    sourcePath: '/functions/groups/fugr_a/fmodules/fm_a/source/main',
  },
  {
    tool: 'GetFunctionInclude',
    args: { function_group_name: 'FUGR_A', include_name: 'INCL_A' },
    sourcePath: '/functions/groups/fugr_a/includes/incl_a/source/main',
  },
];

const METADATA_ONLY: Array<[string, Record<string, unknown>]> = [
  ['GetDomain', { domain_name: 'DOM_A' }],
  ['GetTableType', { table_type_name: 'TTYP_A' }],
  ['GetDataElement', { data_element_name: 'DTEL_A' }],
  ['GetFunctionGroup', { function_group_name: 'FUGR_A' }],
  ['GetPackage', { package_name: 'PKG_A' }],
  ['GetMessageClass', { message_class_name: 'MSAG_A' }],
  ['GetMessageClassMessage', { message_class_name: 'MSAG_A', msgno: '001' }],
];

const MODES: Mode[] = ['pending', 'document', 'not-found'];

const payloadOf = (text: string | undefined): Record<string, unknown> =>
  JSON.parse(text ?? '{}') as Record<string, unknown>;

describe('Get<Type>: one request per call, only the part asked for', () => {
  const context = {
    connection: undefined,
    logger: silentLogger,
  } as unknown as HandlerContext;
  const tools = servedTools(context);

  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  const run = (tool: string, args: Record<string, unknown>, mode: Mode) =>
    runCase(tools, context, { tool, args }, mode);

  describe.each(SOURCE_TYPES.map((t) => [t.tool, t] as const))(
    '%s',
    (_name, t) => {
      it('declares part source | metadata, default source', () => {
        const entry = tools.get(t.tool);
        if (entry === undefined) throw new Error(`no served tool ${t.tool}`);
        const schema = listedJson(entry.toolDefinition.inputSchema);
        expect(jsonAt(schema, 'part')).toMatchObject({
          enum: ['source', 'metadata'],
          default: 'source',
        });
      });

      it.each(MODES)(
        'part source (%s): exactly one request, the source only',
        async (mode) => {
          const ran = await run(t.tool, { ...t.args, part: 'source' }, mode);
          expect(ran.sent).toHaveLength(1);
          if (t.sourcePath !== undefined) {
            expect(ran.sent[0]?.toLowerCase()).toContain(t.sourcePath);
          }
          if (mode === 'document') {
            expect(ran.answer?.isError).toBe(false);
            const payload = payloadOf(ran.answer?.content?.[0]?.text);
            expect(payload).toHaveProperty('source');
            expect(payload.part).toBe('source');
            expect(payload).not.toHaveProperty('metadata');
          }
          if (mode === 'not-found') expect(ran.answer?.isError).toBe(true);
        },
      );

      it.each(MODES)(
        'part metadata (%s): exactly one request, the metadata only',
        async (mode) => {
          const ran = await run(t.tool, { ...t.args, part: 'metadata' }, mode);
          expect(ran.sent).toHaveLength(1);
          expect(ran.sent[0]?.toLowerCase()).not.toContain('/source/');
          if (mode === 'document') {
            expect(ran.answer?.isError).toBe(false);
            const payload = payloadOf(ran.answer?.content?.[0]?.text);
            expect(payload).toHaveProperty('metadata');
            expect(payload).not.toHaveProperty('source');
          }
          if (mode === 'not-found') expect(ran.answer?.isError).toBe(true);
        },
      );

      it('no part reads the source, in one request', async () => {
        const ran = await run(t.tool, { ...t.args }, 'document');
        expect(ran.sent).toHaveLength(1);
        if (t.sourcePath !== undefined) {
          expect(ran.sent[0]?.toLowerCase()).toContain(t.sourcePath);
        }
        const payload = payloadOf(ran.answer?.content?.[0]?.text);
        expect(payload).toHaveProperty('source');
        expect(payload.part).toBe('source');
        expect(payload).not.toHaveProperty('metadata');
      });
    },
  );

  it('GetFunctionModule source: one request with the given group, no metadata read', async () => {
    for (const mode of MODES) {
      const ran = await run(
        'GetFunctionModule',
        { function_module_name: 'FM_A', function_group_name: 'FUGR_A' },
        mode,
      );
      expect(ran.sent.map((s) => s.toLowerCase())).toEqual([
        expect.stringContaining(
          'get /sap/bc/adt/functions/groups/fugr_a/fmodules/fm_a/source/main',
        ),
      ]);
    }
  });

  it.each(METADATA_ONLY)(
    '%s (metadata-only type): one request, no part in the schema',
    async (tool, args) => {
      const entry = tools.get(tool);
      if (entry === undefined) throw new Error(`no served tool ${tool}`);
      const schema = listedJson(entry.toolDefinition.inputSchema);
      expect(schema.properties).toBeDefined();
      expect(schema.properties).not.toHaveProperty('part');
      for (const mode of MODES) {
        const ran = await run(tool, args, mode);
        expect(ran.sent).toHaveLength(1);
      }
    },
  );

  // One answer shape per part, whatever the type: `part` and `metadata`.
  // (A message's read needs a class document holding it: its own test.)
  it.each(METADATA_ONLY.filter(([tool]) => tool !== 'GetMessageClassMessage'))(
    '%s answers { part: "metadata", metadata }',
    async (tool, args) => {
      const ran = await run(tool, args, 'document');
      expect(ran.answer?.isError).toBe(false);
      const payload = payloadOf(ran.answer?.content?.[0]?.text);
      expect(payload.part).toBe('metadata');
      expect(payload).toHaveProperty('metadata');
      expect(payload).not.toHaveProperty('source');
    },
  );
});

describe('the sets serve Get<Type>, and no Read<Type>', () => {
  const context = noConnectionContext();
  const entriesOf = (set: ToolSet): Map<string, HandlerEntry> =>
    new Map(
      set
        .groups(context, 'stdio')
        .flatMap((g: IHandlerGroup) => g.getHandlers())
        .map((e) => [e.toolDefinition.name, e]),
    );
  const full = entriesOf(fullToolSet);
  const readOnly = entriesOf(fullReadOnlyToolSet);
  const GET_TOOLS = [
    ...SOURCE_TYPES.map((t) => t.tool),
    ...METADATA_ONLY.map(([tool]) => tool),
  ];

  it.each(GET_TOOLS)(
    'the -ro set serves %s, the same tool as the full set',
    (tool) => {
      const ro = readOnly.get(tool);
      expect(ro).toBeDefined();
      expect(ro?.toolDefinition).toBe(full.get(tool)?.toolDefinition);
    },
  );

  it('no Read<Type> tool is served in any set', () => {
    const sets: ToolSet[] = [
      fullToolSet,
      fullReadOnlyToolSet,
      compactToolSetOf({
        readOnly: compactReadOnlyEntries,
        modify: compactModifyEntries,
      }),
      compactReadOnlyToolSetOf(compactReadOnlyEntries),
    ];
    // The transport request reads (objects, action log) are not object
    // reads and have no Get<Type>.
    const objectReads = sets
      .flatMap((set) => [...entriesOf(set).keys()])
      .filter((name) => /^Read/.test(name) && !/^ReadTransport/.test(name));
    expect(objectReads).toEqual([]);
  });
});

/**
 * `GetInclude`: its source as text, as it answered before it had a part,
 * and its metadata document in `GetProgram`'s shape — one request each.
 */
describe('GetInclude: the source as text, the metadata as GetProgram answers it', () => {
  const context: HandlerContext = {
    ...noConnectionContext(),
    logger: silentLogger,
  };
  const tools = servedTools(context);
  const SOURCE = "REPORT zincl.\r\n  WRITE 'x'.\n";

  const run = (
    args: Record<string, unknown>,
    mode: Mode,
    body: string | undefined = SOURCE,
  ) => runCase(tools, context, { tool: 'GetInclude', args, body }, mode);

  it('declares include_name required, part and version', () => {
    // The served definition is the handler's own, read by its declared type.
    expect(tools.get('GetInclude')?.toolDefinition).toBe(GET_INCLUDE);
    const schema = listedJson(GET_INCLUDE.inputSchema);
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['include_name']);
    expect(jsonAt(schema, 'part')).toMatchObject({
      enum: ['source', 'metadata'],
      default: 'source',
    });
    expect(jsonAt(schema, 'version').enum).toEqual([
      'active',
      'inactive',
      'workingArea',
    ]);
    expect(jsonAt(schema, 'version')).not.toHaveProperty('default');
  });

  it.each([
    ['absent', {}],
    ['source', { part: 'source' }],
  ])(
    'part %s: one request for the active source, answered as the text SAP sent',
    async (_label, part) => {
      for (const mode of MODES) {
        const ran = await run({ include_name: 'INCL_A', ...part }, mode);
        expect(ran.sent).toEqual([
          'GET /sap/bc/adt/programs/includes/incl_a/source/main?version=active',
        ]);
        if (mode === 'document') {
          expect(ran.answer).toEqual({
            isError: false,
            content: [{ type: 'text', text: SOURCE }],
          });
        }
        if (mode === 'not-found') expect(ran.answer?.isError).toBe(true);
      }
    },
  );

  it.each(['inactive', 'active', 'workingArea'])(
    'version %s: the one source request asks for that version',
    async (version) => {
      const ran = await run({ include_name: 'INCL_A', version }, 'document');
      expect(ran.sent).toEqual([
        `GET /sap/bc/adt/programs/includes/incl_a/source/main?version=${version}`,
      ]);
      expect(ran.answer?.content?.[0]?.text).toBe(SOURCE);
    },
  );

  it.each(MODES)(
    'part metadata (%s): one request for the active metadata document, the GetProgram shape',
    async (mode) => {
      const DOCUMENT = '<include:abapInclude adtcore:name="INCL_A"/>';
      const ran = await run(
        { include_name: 'incl_a', part: 'metadata' },
        mode,
        DOCUMENT,
      );
      expect(ran.sent).toEqual([
        'GET /sap/bc/adt/programs/includes/incl_a?version=active',
      ]);
      if (mode === 'document') {
        expect(ran.answer?.isError).toBe(false);
        expect(payloadOf(ran.answer?.content?.[0]?.text)).toEqual({
          success: true,
          include_name: 'INCL_A',
          part: 'metadata',
          metadata: DOCUMENT,
        });
      }
      if (mode === 'not-found') expect(ran.answer?.isError).toBe(true);
    },
  );

  it('another part is refused by the schema before any request, naming the two', async () => {
    const ran = await run({ include_name: 'INCL_A', part: 'urls' }, 'document');
    expect(ran.sent).toEqual([]);
    expect(ran.answer).toBeUndefined();
    expect(String(ran.threw)).toContain(
      'Invalid arguments for tool GetInclude: Invalid option: expected one of "source"|"metadata" at part',
    );
  });
});
