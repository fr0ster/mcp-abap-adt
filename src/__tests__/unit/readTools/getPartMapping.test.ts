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
import { handleGetBehaviorDefinition } from '../../../handlers/behavior_definition/high/handleGetBehaviorDefinition';
import { handleGetBehaviorImplementation } from '../../../handlers/behavior_implementation/high/handleGetBehaviorImplementation';
import { handleGetClass } from '../../../handlers/class/high/handleGetClass';
import { handleGetDdl } from '../../../handlers/ddl/high/handleGetDdl';
import { handleGetFunctionInclude } from '../../../handlers/function_include/readonly/handleGetFunctionInclude';
import { handleGetFunctionModule } from '../../../handlers/function_module/high/handleGetFunctionModule';
import { handleGetInterface } from '../../../handlers/interface/high/handleGetInterface';
import { handleGetMetadataExtension } from '../../../handlers/metadata_extension/high/handleGetMetadataExtension';
import { handleGetProgram } from '../../../handlers/program/high/handleGetProgram';
import { handleGetServiceBinding } from '../../../handlers/service_binding/high/handleGetServiceBinding';
import { handleGetServiceDefinition } from '../../../handlers/service_definition/high/handleGetServiceDefinition';
import { handleGetStructure } from '../../../handlers/structure/high/handleGetStructure';
import { handleGetTable } from '../../../handlers/table/high/handleGetTable';
import {
  okResponse,
  reading,
  recordAnalyse,
  refusingClient,
  throwingClient,
} from '../../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../../lib/clients', () => ({
  createAdtClient: () => fakeClient,
}));

const context = { connection: {} as any, logger: undefined };

interface Row {
  name: string;
  handler: (ctx: any, args: any) => Promise<any>;
  args: Record<string, unknown>;
  identity: Record<string, string>;
}

const rows: Row[] = [
  {
    name: 'GetClass',
    handler: handleGetClass,
    args: { class_name: 'zc' },
    identity: { class_name: 'ZC' },
  },
  {
    name: 'GetInterface',
    handler: handleGetInterface,
    args: { interface_name: 'zif' },
    identity: { interface_name: 'ZIF' },
  },
  {
    name: 'GetProgram',
    handler: handleGetProgram,
    args: { program_name: 'zp' },
    identity: { program_name: 'ZP' },
  },
  {
    name: 'GetTable',
    handler: handleGetTable,
    args: { table_name: 'zt' },
    identity: { table_name: 'ZT' },
  },
  {
    name: 'GetStructure',
    handler: handleGetStructure,
    args: { structure_name: 'zs' },
    identity: { structure_name: 'ZS' },
  },
  {
    name: 'GetDdl',
    handler: handleGetDdl,
    args: { ddl_name: 'zddl' },
    identity: { ddl_name: 'ZDDL' },
  },
  {
    name: 'GetServiceDefinition',
    handler: handleGetServiceDefinition,
    args: { service_definition_name: 'zsd' },
    identity: { service_definition_name: 'ZSD' },
  },
  {
    name: 'GetServiceBinding',
    handler: handleGetServiceBinding,
    args: { service_binding_name: 'zsb', response_format: 'plain' },
    identity: { service_binding_name: 'ZSB' },
  },
  {
    name: 'GetBehaviorDefinition',
    handler: handleGetBehaviorDefinition,
    args: { behavior_definition_name: 'zbd' },
    identity: { behavior_definition_name: 'ZBD' },
  },
  {
    name: 'GetBehaviorImplementation',
    handler: handleGetBehaviorImplementation,
    args: { behavior_implementation_name: 'zbi' },
    identity: { behavior_implementation_name: 'ZBI' },
  },
  {
    name: 'GetMetadataExtension',
    handler: handleGetMetadataExtension,
    args: { metadata_extension_name: 'zme' },
    identity: { metadata_extension_name: 'ZME' },
  },
  {
    name: 'GetFunctionModule',
    handler: handleGetFunctionModule,
    args: { function_module_name: 'zfm', function_group_name: 'zfg' },
    identity: { function_module_name: 'ZFM', function_group_name: 'ZFG' },
  },
  {
    name: 'GetFunctionInclude',
    handler: handleGetFunctionInclude,
    args: { function_group_name: 'zfg', include_name: 'zinc' },
    identity: { function_group_name: 'ZFG', include_name: 'ZINC' },
  },
];

const SOURCE = 'SOURCE MARKER';
const METADATA = 'METADATA MARKER';
describe.each(rows.map((r) => [r.name, r] as const))('%s', (_name, row) => {
  it('part source answers the source from read, and nothing of the metadata', async () => {
    const seen = recordAnalyse({
      read: () => reading(SOURCE),
      readMetadata: () => reading(METADATA),
    });
    fakeClient = seen.client;
    const result = await row.handler(context, { ...row.args, part: 'source' });
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.source).toBe(SOURCE);
    expect(payload.part).toBe('source');
    expect(payload).not.toHaveProperty('metadata');
    for (const [field, value] of Object.entries(row.identity)) {
      expect(payload[field]).toBe(value);
    }
    expect([seen.countOf('read'), seen.countOf('readMetadata')]).toEqual([
      1, 0,
    ]);
    expect(seen.calls[0]?.carriedAnalyse).toBe(true);
  });

  it('part metadata answers the metadata from readMetadata, and nothing of the source', async () => {
    const seen = recordAnalyse({
      read: () => reading(SOURCE),
      readMetadata: () => reading(METADATA),
    });
    fakeClient = seen.client;
    const result = await row.handler(context, {
      ...row.args,
      part: 'metadata',
    });
    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.metadata).toBe(METADATA);
    expect(payload.part).toBe('metadata');
    expect(payload).not.toHaveProperty('source');
    for (const [field, value] of Object.entries(row.identity)) {
      expect(payload[field]).toBe(value);
    }
    expect([seen.countOf('read'), seen.countOf('readMetadata')]).toEqual([
      0, 1,
    ]);
    expect(seen.calls[0]?.carriedAnalyse).toBe(true);
  });

  it('a part other than source or metadata is refused before any call', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;
    const result = await row.handler(context, { ...row.args, part: 'urls' });
    expect([seen.countOf('read'), seen.countOf('readMetadata')]).toEqual([
      0, 0,
    ]);
    expect(seen.calls).toEqual([]);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'part must be "source" or "metadata"',
    );
  });

  it.each(['source', 'metadata'])(
    'part %s reports a refusal as an error',
    async (part) => {
      fakeClient = refusingClient('Resource not found');
      const result = await row.handler(context, { ...row.args, part });
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).message).toBe(
        'Resource not found',
      );
    },
  );

  it.each(['source', 'metadata'])(
    'part %s names a thrown failure client_threw, carrying its own tool',
    async (part) => {
      fakeClient = throwingClient('boom');
      const result = await row.handler(context, { ...row.args, part });
      expect(result.isError).toBe(true);
      const payload = JSON.parse(result.content[0].text);
      expect(payload.error).toBe('client_threw');
      expect(payload.tool).toBe(row.name);
    },
  );
});
