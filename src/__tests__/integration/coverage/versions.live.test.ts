/**
 * The generated per-type version tools (`objectVersionTools.ts`), live, on
 * both systems: for each versioned type, `Get<Type>Versions` lists the
 * version history of an object, `Get<Type>VersionSource` reads the source
 * of a version it lists, and `Get<Type>VersionDiff` compares two of them
 * (the oldest and the newest; one version compared with itself where the
 * history holds one). The table type has its version list alone.
 *
 * Reads only, of the shared objects (`shared_dependencies`, created once by
 * `npm run shared:setup`, never written here) — and on the cloud, whose
 * programs are SAP's own, of an SAP program found by a repository search.
 * The table type, which the shared set has none of, is created by the case
 * in the package the coverage suites create in (`ownPackage`), its name read
 * free first and recorded for cleanup before its create; it is deleted after
 * and read absent.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveAnswer,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import {
  member,
  onPremise,
  onRequest,
  ownPackage,
  payloadOf,
  succeeded,
} from './ownObjects';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const TABLE_TYPE = `ZMCP_VT_${SUFFIX}`;

/** The versions a list answered: each one's contentUri. */
function contentUris(answer: LiveAnswer): string[] {
  const versions = member(payloadOf(answer), 'versions');
  if (!Array.isArray(versions) || versions.length === 0) {
    throw new Error(`no versions: ${answer.text}`);
  }
  return versions.map((version) => {
    const uri = member(version, 'contentUri');
    if (typeof uri !== 'string' || uri === '') {
      throw new Error(`a version without contentUri: ${answer.text}`);
    }
    return uri;
  });
}

/** The source a version read answered. */
function sourceOf(answer: LiveAnswer): string {
  const source = member(payloadOf(answer), 'source');
  if (typeof source !== 'string') {
    throw new Error(`no source: ${answer.text}`);
  }
  return source;
}

/** The oldest and the newest version: the last and the first listed. */
function ends(uris: readonly string[]): { from: string; to: string } {
  const to = uris[0];
  const from = uris.at(-1);
  if (to === undefined || from === undefined) throw new Error('no versions');
  return { from, to };
}

/** A diff answered its two versions and whether they are identical. */
function expectDiff(answer: LiveAnswer, from: string, to: string): void {
  const payload = payloadOf(answer);
  assert.equal(member(payload, 'content_uri_from'), from);
  assert.equal(member(payload, 'content_uri_to'), to);
  assert.equal(typeof member(payload, 'identical'), 'boolean');
  if (from === to) assert.equal(member(payload, 'identical'), true);
}

liveSuite(['onprem', 'cloud'], 'The per-type version tools', () => {
  after(async () => {
    await deleteRecorded();
    await expectAbsent({
      tool: 'GetTableType',
      args: { table_type_name: TABLE_TYPE },
    });
  });

  it('a class: GetClassVersions, GetClassVersionSource, GetClassVersionDiff', async () => {
    const listed = await liveCall('GetClassVersions', {
      class_name: 'ZCL_MCP_SHARED_CLS',
    });
    const uris = contentUris(succeeded('GetClassVersions', listed));
    const { from, to } = ends(uris);
    const read = await liveCall('GetClassVersionSource', { content_uri: to });
    assert.ok(
      sourceOf(succeeded('GetClassVersionSource', read))
        .toLowerCase()
        .includes('class zcl_mcp_shared_cls'),
    );
    const diff = await liveCall('GetClassVersionDiff', {
      content_uri_from: from,
      content_uri_to: to,
    });
    expectDiff(succeeded('GetClassVersionDiff', diff), from, to);
  });

  it('an interface: GetInterfaceVersions, GetInterfaceVersionSource, GetInterfaceVersionDiff', async () => {
    const listed = await liveCall('GetInterfaceVersions', {
      interface_name: 'ZIF_MCP_SHARED',
    });
    const { from, to } = ends(
      contentUris(succeeded('GetInterfaceVersions', listed)),
    );
    const read = await liveCall('GetInterfaceVersionSource', {
      content_uri: to,
    });
    assert.ok(
      sourceOf(succeeded('GetInterfaceVersionSource', read))
        .toLowerCase()
        .includes('interface zif_mcp_shared'),
    );
    const diff = await liveCall('GetInterfaceVersionDiff', {
      content_uri_from: from,
      content_uri_to: to,
    });
    expectDiff(succeeded('GetInterfaceVersionDiff', diff), from, to);
  });

  it('a function module: GetFunctionModuleVersions, GetFunctionModuleVersionSource, GetFunctionModuleVersionDiff', async () => {
    const listed = await liveCall('GetFunctionModuleVersions', {
      function_module_name: 'Z_MCP_SHR_FM',
      function_group_name: 'ZMCP_SHR_FGRP',
    });
    const { from, to } = ends(
      contentUris(succeeded('GetFunctionModuleVersions', listed)),
    );
    const read = await liveCall('GetFunctionModuleVersionSource', {
      content_uri: to,
    });
    assert.ok(
      sourceOf(succeeded('GetFunctionModuleVersionSource', read))
        .toLowerCase()
        .includes('function z_mcp_shr_fm'),
    );
    const diff = await liveCall('GetFunctionModuleVersionDiff', {
      content_uri_from: from,
      content_uri_to: to,
    });
    expectDiff(succeeded('GetFunctionModuleVersionDiff', diff), from, to);
  });

  it('a table: GetTableVersions, GetTableVersionSource, GetTableVersionDiff', async () => {
    const listed = await liveCall('GetTableVersions', {
      table_name: 'ZMCP_SHR_RTABL',
    });
    const { from, to } = ends(
      contentUris(succeeded('GetTableVersions', listed)),
    );
    const read = await liveCall('GetTableVersionSource', { content_uri: to });
    assert.ok(
      sourceOf(succeeded('GetTableVersionSource', read))
        .toLowerCase()
        .includes('define table zmcp_shr_rtabl'),
    );
    const diff = await liveCall('GetTableVersionDiff', {
      content_uri_from: from,
      content_uri_to: to,
    });
    expectDiff(succeeded('GetTableVersionDiff', diff), from, to);
  });

  it('a structure: GetStructureVersions, GetStructureVersionSource, GetStructureVersionDiff', async () => {
    const listed = await liveCall('GetStructureVersions', {
      structure_name: 'ZMCP_SHR_STRUCT',
    });
    const { from, to } = ends(
      contentUris(succeeded('GetStructureVersions', listed)),
    );
    const read = await liveCall('GetStructureVersionSource', {
      content_uri: to,
    });
    assert.ok(
      sourceOf(succeeded('GetStructureVersionSource', read))
        .toLowerCase()
        .includes('define structure zmcp_shr_struct'),
    );
    const diff = await liveCall('GetStructureVersionDiff', {
      content_uri_from: from,
      content_uri_to: to,
    });
    expectDiff(succeeded('GetStructureVersionDiff', diff), from, to);
  });

  it('a CDS view: GetDdlVersions, GetDdlVersionSource, GetDdlVersionDiff', async () => {
    const listed = await liveCall('GetDdlVersions', {
      ddl_name: 'ZMCP_SHR_I_ROOT',
    });
    const { from, to } = ends(contentUris(succeeded('GetDdlVersions', listed)));
    const read = await liveCall('GetDdlVersionSource', { content_uri: to });
    assert.ok(
      sourceOf(succeeded('GetDdlVersionSource', read))
        .toLowerCase()
        .includes('zmcp_shr_i_root'),
    );
    const diff = await liveCall('GetDdlVersionDiff', {
      content_uri_from: from,
      content_uri_to: to,
    });
    expectDiff(succeeded('GetDdlVersionDiff', diff), from, to);
  });

  it('a behavior definition: GetBehaviorDefinitionVersions, GetBehaviorDefinitionVersionSource, GetBehaviorDefinitionVersionDiff', async () => {
    const listed = await liveCall('GetBehaviorDefinitionVersions', {
      behavior_definition_name: 'ZMCP_SHR_I_ROOT',
    });
    const { from, to } = ends(
      contentUris(succeeded('GetBehaviorDefinitionVersions', listed)),
    );
    const read = await liveCall('GetBehaviorDefinitionVersionSource', {
      content_uri: to,
    });
    assert.ok(
      sourceOf(succeeded('GetBehaviorDefinitionVersionSource', read))
        .toLowerCase()
        .includes('zmcp_shr_i_root'),
    );
    const diff = await liveCall('GetBehaviorDefinitionVersionDiff', {
      content_uri_from: from,
      content_uri_to: to,
    });
    expectDiff(succeeded('GetBehaviorDefinitionVersionDiff', diff), from, to);
  });

  it('a metadata extension: GetMetadataExtensionVersions, GetMetadataExtensionVersionSource, GetMetadataExtensionVersionDiff', async () => {
    const listed = await liveCall('GetMetadataExtensionVersions', {
      metadata_extension_name: 'ZC_MCP_SHR_DDLX',
    });
    const { from, to } = ends(
      contentUris(succeeded('GetMetadataExtensionVersions', listed)),
    );
    const read = await liveCall('GetMetadataExtensionVersionSource', {
      content_uri: to,
    });
    assert.ok(
      sourceOf(succeeded('GetMetadataExtensionVersionSource', read))
        .toLowerCase()
        .includes('annotate entity zmcp_shr_c_root'),
    );
    const diff = await liveCall('GetMetadataExtensionVersionDiff', {
      content_uri_from: from,
      content_uri_to: to,
    });
    expectDiff(succeeded('GetMetadataExtensionVersionDiff', diff), from, to);
  });

  it('a program: GetProgramVersions, GetProgramVersionSource, GetProgramVersionDiff', async () => {
    const program = onPremise() ? 'ZMCP_SHR_PROG' : await sapProgram();
    const listed = await liveCall('GetProgramVersions', {
      program_name: program,
    });
    const { from, to } = ends(
      contentUris(succeeded('GetProgramVersions', listed)),
    );
    const read = await liveCall('GetProgramVersionSource', {
      content_uri: to,
    });
    assert.ok(sourceOf(succeeded('GetProgramVersionSource', read)).length > 0);
    const diff = await liveCall('GetProgramVersionDiff', {
      content_uri_from: from,
      content_uri_to: to,
    });
    expectDiff(succeeded('GetProgramVersionDiff', diff), from, to);
  });

  it('a table type of its own: GetTableTypeVersions', async () => {
    await expectNameFree({
      tool: 'GetTableType',
      args: { table_type_name: TABLE_TYPE },
    });
    recordCreated('DeleteTableType', {
      table_type_name: TABLE_TYPE,
      ...onRequest(),
    });
    succeeded(
      'CreateTableType',
      await livePrepare('CreateTableType', {
        table_type_name: TABLE_TYPE,
        package_name: ownPackage(),
        description: 'MCP versions live case',
        row_type_kind: 'dictionaryType',
        row_type_name: 'ABAP_BOOLEAN',
        access_type: 'standard',
        key_definition: 'standard',
        key_kind: 'nonUnique',
        ...onRequest(),
      }),
    );
    const listed = await liveCall('GetTableTypeVersions', {
      table_type_name: TABLE_TYPE,
    });
    contentUris(succeeded('GetTableTypeVersions', listed));
    assert.equal(member(payloadOf(listed), 'object_name'), TABLE_TYPE);
  });
});

/** An SAP program on the cloud, found by a repository search. */
async function sapProgram(): Promise<string> {
  const found = succeeded(
    'SearchObject PROG',
    await livePrepare('SearchObject', {
      object_name: 'RS*',
      object_type: 'PROG',
      max_results: 5,
    }),
  );
  // A table: a header line, then one line per hit, tab-separated
  // (name, type, description, package).
  const names = found.text
    .split('\n')
    .slice(1)
    .map((line) => line.split('\t'))
    .filter(([, type]) => type === 'PROG/P')
    .map(([name]) => name);
  const [first] = names;
  if (first === undefined) {
    throw new Error(`the search found no SAP program: ${found.text}`);
  }
  return first;
}
