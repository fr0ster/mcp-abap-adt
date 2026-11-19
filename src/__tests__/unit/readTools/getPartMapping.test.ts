/**
 * `Get<Type>` with `part`: a success is mapped into the right field — the
 * source part from `read`, the metadata part from `readMetadata`, never
 * swapped and never both — and a refusal or a throw reaches the caller with
 * the tool's own name. `source` and `metadata` get different bodies, so a
 * swap fails loudly.
 *
 * As in every other file that uses `fakeClientOf`: it ignores the factory
 * argument, so no assertion here proves a handler injected
 * `resultsFor(xDocuments)` — `tsc` guards that.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';
import {
  TOOL_DEFINITION as GetBehaviorDefinitionDefinition,
  handleGetBehaviorDefinition,
} from '../../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import {
  TOOL_DEFINITION as GetBehaviorImplementationDefinition,
  handleGetBehaviorImplementation,
} from '../../../handlers/behavior_implementation/high/handleGetBehaviorImplementation';
import {
  TOOL_DEFINITION as GetClassDefinition,
  handleGetClass,
} from '../../../handlers/class/high/handleGetClass';
import {
  TOOL_DEFINITION as GetDdlDefinition,
  handleGetDdl,
} from '../../../handlers/ddl/high/handleGetDdl';
import {
  TOOL_DEFINITION as GetFunctionIncludeDefinition,
  handleGetFunctionInclude,
} from '../../../handlers/function_include/readonly/handleGetFunctionInclude';
import {
  TOOL_DEFINITION as GetFunctionModuleDefinition,
  handleGetFunctionModule,
} from '../../../handlers/function_module/high/handleGetFunctionModule';
import {
  TOOL_DEFINITION as GetInterfaceDefinition,
  handleGetInterface,
} from '../../../handlers/interface/high/handleGetInterface';
import {
  TOOL_DEFINITION as GetMetadataExtensionDefinition,
  handleGetMetadataExtension,
} from '../../../handlers/metadata_extension/high/handleGetMetadataExtension';
import {
  TOOL_DEFINITION as GetProgramDefinition,
  handleGetProgram,
} from '../../../handlers/program/high/handleGetProgram';
import {
  TOOL_DEFINITION as GetServiceBindingDefinition,
  handleGetServiceBinding,
} from '../../../handlers/service_binding/high/handleGetServiceBinding';
import {
  TOOL_DEFINITION as GetServiceDefinitionDefinition,
  handleGetServiceDefinition,
} from '../../../handlers/service_definition/high/handleGetServiceDefinition';
import {
  TOOL_DEFINITION as GetStructureDefinition,
  handleGetStructure,
} from '../../../handlers/structure/high/handleGetStructure';
import {
  TOOL_DEFINITION as GetTableDefinition,
  handleGetTable,
} from '../../../handlers/table/high/handleGetTable';
import * as clients from '../../../lib/clients';
import {
  defineTool,
  type ToolDefinition,
} from '../../../lib/handlers/interfaces';
import { assertRejects } from '../../helpers/assertions';
import {
  okResponse,
  reading,
  recordAnalyse,
  refusingClient,
  throwingClient,
} from '../../helpers/fakeClient';
import { moduleMetadataDocument } from '../../helpers/functionModuleMetadata';

mock.method(clients, 'createAdtClient', () => fakeClient);

let fakeClient: any;

const context = { connection: {} as any, logger: undefined };

interface Row {
  name: string;
  handler: (ctx: any, args: any) => Promise<any>;
  /** The tool's definition: its entry parses a call with its schema first. */
  definition: ToolDefinition;
  args: Record<string, unknown>;
  identity: Record<string, string>;
  /**
   * The metadata is read before the source, and names the group given: a
   * function module's group is checked first (#2).
   */
  metadataFirst?: true;
}

const rows: Row[] = [
  {
    name: 'GetClass',
    handler: handleGetClass,
    definition: GetClassDefinition,
    args: { class_name: 'zc' },
    identity: { class_name: 'ZC' },
  },
  {
    name: 'GetInterface',
    handler: handleGetInterface,
    definition: GetInterfaceDefinition,
    args: { interface_name: 'zif' },
    identity: { interface_name: 'ZIF' },
  },
  {
    name: 'GetProgram',
    handler: handleGetProgram,
    definition: GetProgramDefinition,
    args: { program_name: 'zp' },
    identity: { program_name: 'ZP' },
  },
  {
    name: 'GetTable',
    handler: handleGetTable,
    definition: GetTableDefinition,
    args: { table_name: 'zt' },
    identity: { table_name: 'ZT' },
  },
  {
    name: 'GetStructure',
    handler: handleGetStructure,
    definition: GetStructureDefinition,
    args: { structure_name: 'zs' },
    identity: { structure_name: 'ZS' },
  },
  {
    name: 'GetDdl',
    handler: handleGetDdl,
    definition: GetDdlDefinition,
    args: { ddl_name: 'zddl' },
    identity: { ddl_name: 'ZDDL' },
  },
  {
    name: 'GetServiceDefinition',
    handler: handleGetServiceDefinition,
    definition: GetServiceDefinitionDefinition,
    args: { service_definition_name: 'zsd' },
    identity: { service_definition_name: 'ZSD' },
  },
  {
    name: 'GetServiceBinding',
    handler: handleGetServiceBinding,
    definition: GetServiceBindingDefinition,
    args: { service_binding_name: 'zsb', response_format: 'plain' },
    identity: { service_binding_name: 'ZSB' },
  },
  {
    name: 'GetBehaviorDefinition',
    handler: handleGetBehaviorDefinition,
    definition: GetBehaviorDefinitionDefinition,
    args: { behavior_definition_name: 'zbd' },
    identity: { behavior_definition_name: 'ZBD' },
  },
  {
    name: 'GetBehaviorImplementation',
    handler: handleGetBehaviorImplementation,
    definition: GetBehaviorImplementationDefinition,
    args: { behavior_implementation_name: 'zbi' },
    identity: { behavior_implementation_name: 'ZBI' },
  },
  {
    name: 'GetMetadataExtension',
    handler: handleGetMetadataExtension,
    definition: GetMetadataExtensionDefinition,
    args: { metadata_extension_name: 'zme' },
    identity: { metadata_extension_name: 'ZME' },
  },
  {
    name: 'GetFunctionModule',
    handler: handleGetFunctionModule,
    definition: GetFunctionModuleDefinition,
    args: { function_module_name: 'zfm', function_group_name: 'zfg' },
    identity: { function_module_name: 'ZFM', function_group_name: 'ZFG' },
    metadataFirst: true,
  },
  {
    name: 'GetFunctionInclude',
    handler: handleGetFunctionInclude,
    definition: GetFunctionIncludeDefinition,
    args: { function_group_name: 'zfg', include_name: 'zinc' },
    identity: { function_group_name: 'ZFG', include_name: 'ZINC' },
  },
];

const SOURCE = 'SOURCE MARKER';
const METADATA = 'METADATA MARKER';

/** The metadata a row's `readMetadata` answers: one naming the group given where it is read first. */
const metadataOf = (row: Row): string =>
  row.metadataFirst ? moduleMetadataDocument('ZFM', 'ZFG') : METADATA;

for (const [_name, row] of rows.map((r) => [r.name, r] as const)) {
  describe(format('%s', _name), () => {
    it('part source answers the source from read, and nothing of the metadata', async () => {
      const seen = recordAnalyse({
        read: () => reading(SOURCE),
        readMetadata: () => reading(metadataOf(row)),
      });
      fakeClient = seen.client;
      const result = await row.handler(context, {
        ...row.args,
        part: 'source',
      });
      assert.equal(result.isError, false);
      const payload = JSON.parse(result.content[0].text);
      assert.equal(payload.source, SOURCE);
      assert.equal(payload.part, 'source');
      assert.ok(!('metadata' in Object(payload)));
      for (const [field, value] of Object.entries(row.identity)) {
        assert.equal(payload[field], value);
      }
      assert.deepStrictEqual(
        [seen.countOf('read'), seen.countOf('readMetadata')],
        [1, row.metadataFirst ? 1 : 0],
      );
      assert.equal(seen.calls[0]?.carriedAnalyse, true);
    });

    it('part metadata answers the metadata from readMetadata, and nothing of the source', async () => {
      const seen = recordAnalyse({
        read: () => reading(SOURCE),
        readMetadata: () => reading(metadataOf(row)),
      });
      fakeClient = seen.client;
      const result = await row.handler(context, {
        ...row.args,
        part: 'metadata',
      });
      assert.equal(result.isError, false);
      const payload = JSON.parse(result.content[0].text);
      assert.equal(payload.metadata, metadataOf(row));
      assert.equal(payload.part, 'metadata');
      assert.ok(!('source' in Object(payload)));
      for (const [field, value] of Object.entries(row.identity)) {
        assert.equal(payload[field], value);
      }
      assert.deepStrictEqual(
        [seen.countOf('read'), seen.countOf('readMetadata')],
        [0, 1],
      );
      assert.equal(seen.calls[0]?.carriedAnalyse, true);
    });

    it("a part other than source or metadata is refused by the tool's schema, before any call", async () => {
      const seen = recordAnalyse();
      fakeClient = seen.client;
      const refused = assertRejects(
        defineTool(row.definition, row.handler).call(context, {
          ...row.args,
          part: 'urls',
        }),
        'part',
      );
      await refused;
      assert.deepStrictEqual(
        [seen.countOf('read'), seen.countOf('readMetadata')],
        [0, 0],
      );
      assert.deepStrictEqual(seen.calls, []);
    });

    for (const part of ['source', 'metadata']) {
      it(format('part %s reports a refusal as an error', part), async () => {
        fakeClient = refusingClient('Resource not found');
        const result = await row.handler(context, { ...row.args, part });
        assert.equal(result.isError, true);
        assert.equal(
          JSON.parse(result.content[0].text).message,
          'Resource not found',
        );
      });
    }

    for (const part of ['source', 'metadata']) {
      it(
        format(
          'part %s names a thrown failure client_threw, carrying its own tool',
          part,
        ),
        async () => {
          fakeClient = throwingClient('boom');
          const result = await row.handler(context, { ...row.args, part });
          assert.equal(result.isError, true);
          const payload = JSON.parse(result.content[0].text);
          assert.equal(payload.error, 'client_threw');
          assert.equal(payload.tool, row.name);
        },
      );
    }
  });
}
