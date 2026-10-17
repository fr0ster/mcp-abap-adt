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
import { silentLogger } from '../../helpers/lowToCompact';

interface SourceType {
  tool: string;
  args: Record<string, unknown>;
  /** The answer's key that carries the source. */
  sourceKey: string;
  /** The one source request's path fragment; absent when it is the object's own URI. */
  sourcePath?: string;
}

const SOURCE_TYPES: SourceType[] = [
  {
    tool: 'GetClass',
    args: { class_name: 'CLAS_A' },
    sourceKey: 'source_code',
    sourcePath: '/oo/classes/clas_a/source/main',
  },
  {
    tool: 'GetInterface',
    args: { interface_name: 'INTF_A' },
    sourceKey: 'interface_data',
    sourcePath: '/oo/interfaces/intf_a/source/main',
  },
  {
    tool: 'GetProgram',
    args: { program_name: 'PROG_A' },
    sourceKey: 'program_data',
    sourcePath: '/programs/programs/prog_a/source/main',
  },
  {
    tool: 'GetTable',
    args: { table_name: 'TAB_A' },
    sourceKey: 'table_data',
    sourcePath: '/ddic/tables/tab_a/source/main',
  },
  {
    tool: 'GetStructure',
    args: { structure_name: 'STRU_A' },
    sourceKey: 'structure_data',
    sourcePath: '/ddic/structures/stru_a/source/main',
  },
  {
    tool: 'GetDdl',
    args: { ddl_name: 'DDL_A' },
    sourceKey: 'ddl_data',
    sourcePath: '/ddic/ddl/sources/ddl_a/source/main',
  },
  {
    tool: 'GetServiceDefinition',
    args: { service_definition_name: 'SRVD_A' },
    sourceKey: 'service_definition_data',
    sourcePath: '/ddic/srvd/sources/srvd_a/source/main',
  },
  {
    tool: 'GetServiceBinding',
    args: { service_binding_name: 'SRVB_A' },
    sourceKey: 'payload',
  },
  {
    tool: 'GetBehaviorDefinition',
    args: { behavior_definition_name: 'BDEF_A' },
    sourceKey: 'behavior_definition_data',
    sourcePath: '/bo/behaviordefinitions/bdef_a/source/main',
  },
  {
    tool: 'GetBehaviorImplementation',
    args: { behavior_implementation_name: 'BIMP_A' },
    sourceKey: 'behavior_implementation_data',
    sourcePath: '/oo/classes/bimp_a/source/main',
  },
  {
    tool: 'GetMetadataExtension',
    args: { metadata_extension_name: 'DDLX_A' },
    sourceKey: 'metadata_extension_data',
    sourcePath: '/ddic/ddlx/sources/ddlx_a/source/main',
  },
  {
    tool: 'GetFunctionModule',
    args: { function_module_name: 'FM_A', function_group_name: 'FUGR_A' },
    sourceKey: 'function_module_data',
    sourcePath: '/functions/groups/fugr_a/fmodules/fm_a/source/main',
  },
  {
    tool: 'GetFunctionInclude',
    args: { function_group_name: 'FUGR_A', include_name: 'INCL_A' },
    sourceKey: 'source_code',
    sourcePath: '/functions/groups/fugr_a/includes/incl_a/source/main',
  },
];

const METADATA_ONLY: Array<[string, Record<string, unknown>]> = [
  ['GetDomain', { domain_name: 'DOM_A' }],
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
        const schema = tools.get(t.tool)?.toolDefinition.inputSchema as {
          properties: Record<string, { enum?: unknown; default?: unknown }>;
        };
        expect(schema.properties.part).toMatchObject({
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
            expect(payload).toHaveProperty(t.sourceKey);
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
            expect(payload).not.toHaveProperty(t.sourceKey);
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
        expect(payload).toHaveProperty(t.sourceKey);
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
      const schema = tools.get(tool)?.toolDefinition.inputSchema as {
        properties: Record<string, unknown>;
      };
      expect(schema.properties).not.toHaveProperty('part');
      for (const mode of MODES) {
        const ran = await run(tool, args, mode);
        expect(ran.sent).toHaveLength(1);
      }
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
