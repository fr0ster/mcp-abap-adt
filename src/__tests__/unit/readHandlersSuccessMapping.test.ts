/**
 * Companion to `readHandlersSurfaceErrors.test.ts`: that file proves a
 * refusal reaches the caller; this one proves a SUCCESS is mapped into the
 * right fields, for the same sixteen handlers.
 *
 * Refusal coverage alone cannot catch the failure mode two-call handlers are
 * actually prone to when copied sixteen times: a `pair(...)` tuple
 * destructured in the wrong order, or a projection that reads `metadata.raw`
 * where it meant `source.raw`. Both compile — `AdtReading<string>` is the
 * type of both halves — and neither trips `refusingClient`, since a refusal
 * short-circuits before either field is read. `source` and `metadata` are
 * therefore given deliberately different bodies below, so a swap fails
 * loudly instead of two fields quietly trading places.
 *
 * As in every other file that uses `fakeClientOf`: it ignores the factory
 * argument, so no assertion here proves a handler injected
 * `resultsFor(xDocuments)` — `tsc` guards that (see `domainLow.test.ts`).
 *
 * Corpus coverage is uneven. `functionModule` is the only handler in this
 * family with both a captured source AND a captured metadata document
 * (`read-function-module-source-text--01-read-source`,
 * `read-metadata-function-module--01-fmodules-zmcpshrfm`); its metadata also
 * carries a real `containerRef`, which `handleReadFunctionModule` parses.
 * `table`, `structure`, `serviceDefinition`, `ddl`, `behaviorDefinition`,
 * `package` and `functionGroup` have a captured metadata document but no
 * captured source — their `source` marker below is synthetic, and their
 * `metadata` is the real fixture. `serviceBinding`, `program`,
 * `metadataExtension`, `interface`, `functionInclude`, `behaviorImplementation`,
 * `domain` and `dataElement` have no fixture at all in `tests/fixtures/adt/`
 * for either call, so both markers are synthetic. `package` and
 * `functionGroup` have no source resource to begin with (see the handlers'
 * own comments) — their `source` column is omitted, since `source_code` and
 * `metadata` are both the single fetched document by design.
 */
import { handleReadBehaviorDefinition } from '../../handlers/behavior_definition/readonly/handleReadBehaviorDefinition';
import { handleReadBehaviorImplementation } from '../../handlers/behavior_implementation/readonly/handleReadBehaviorImplementation';
import { handleReadDataElement } from '../../handlers/data_element/readonly/handleReadDataElement';
import { handleReadDdl } from '../../handlers/ddl/readonly/handleReadDdl';
import { handleReadDomain } from '../../handlers/domain/readonly/handleReadDomain';
import { handleReadFunctionGroup } from '../../handlers/function_group/readonly/handleReadFunctionGroup';
import { handleReadFunctionInclude } from '../../handlers/function_include/readonly/handleReadFunctionInclude';
import { handleReadFunctionModule } from '../../handlers/function_module/readonly/handleReadFunctionModule';
import { handleReadInterface } from '../../handlers/interface/readonly/handleReadInterface';
import { handleReadMetadataExtension } from '../../handlers/metadata_extension/readonly/handleReadMetadataExtension';
import { handleReadPackage } from '../../handlers/package/readonly/handleReadPackage';
import { handleReadProgram } from '../../handlers/program/readonly/handleReadProgram';
import { handleReadServiceBinding } from '../../handlers/service_binding/readonly/handleReadServiceBinding';
import { handleReadServiceDefinition } from '../../handlers/service_definition/readonly/handleReadServiceDefinition';
import { handleReadStructure } from '../../handlers/structure/readonly/handleReadStructure';
import { handleReadTable } from '../../handlers/table/readonly/handleReadTable';
import { corpusBody } from '../../lib/adtCorpus';
import {
  fakeClientOf,
  okResponse,
  reading,
  recordAnalyse,
} from '../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

describe('readonly handlers map a success into the right fields, not swapped', () => {
  it.each([
    {
      name: 'ReadTable',
      handler: handleReadTable,
      args: { table_name: 'zt' },
      identity: { table_name: 'ZT' },
      source: 'TABLE SOURCE MARKER',
      metadata: corpusBody(
        'read-table-metadata-structure--01-tables-zmcpshrrtabl',
      ),
    },
    {
      name: 'ReadStructure',
      handler: handleReadStructure,
      args: { structure_name: 'zs' },
      identity: { structure_name: 'ZS' },
      source: 'STRUCTURE SOURCE MARKER',
      metadata: corpusBody(
        'read-metadata-structure--01-structures-zmcpshrstru',
      ),
    },
    {
      name: 'ReadServiceDefinition',
      handler: handleReadServiceDefinition,
      args: { service_definition_name: 'zsd' },
      identity: { service_definition_name: 'ZSD' },
      source: 'SERVICE DEFINITION SOURCE MARKER',
      metadata: corpusBody(
        'read-metadata-service-definition--01-sources-zmcpshrsrvd01',
      ),
    },
    {
      name: 'ReadServiceBinding',
      handler: handleReadServiceBinding,
      args: { service_binding_name: 'zsb' },
      identity: { service_binding_name: 'ZSB' },
      source: 'SERVICE BINDING SOURCE MARKER (no fixture)',
      metadata: 'SERVICE BINDING METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadProgram',
      handler: handleReadProgram,
      args: { program_name: 'zp' },
      identity: { program_name: 'ZP' },
      source: 'PROGRAM SOURCE MARKER (no fixture)',
      // ReadProgram rejects anything that is not PROG/P, so the metadata
      // marker must carry that adtcore:type for the success path to be
      // reachable at all.
      metadata: '<a adtcore:type="PROG/P"/>',
    },
    {
      name: 'ReadMetadataExtension',
      handler: handleReadMetadataExtension,
      args: { metadata_extension_name: 'zme' },
      identity: { metadata_extension_name: 'ZME' },
      source: 'METADATA EXTENSION SOURCE MARKER (no fixture)',
      metadata: 'METADATA EXTENSION METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadInterface',
      handler: handleReadInterface,
      args: { interface_name: 'zif' },
      identity: { interface_name: 'ZIF' },
      source: 'INTERFACE SOURCE MARKER (no fixture)',
      metadata: 'INTERFACE METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadFunctionInclude',
      handler: handleReadFunctionInclude,
      args: { function_group_name: 'zfg', include_name: 'zinc' },
      identity: { include_name: 'ZINC', function_group_name: 'ZFG' },
      source: 'FUNCTION INCLUDE SOURCE MARKER (no fixture)',
      metadata: 'FUNCTION INCLUDE METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadDdl',
      handler: handleReadDdl,
      args: { ddl_name: 'zddl' },
      identity: { ddl_name: 'ZDDL' },
      source: 'DDL SOURCE MARKER',
      metadata: corpusBody('read-metadata-ddl--01-sources-zmcpshriroot'),
    },
    {
      name: 'ReadBehaviorImplementation',
      handler: handleReadBehaviorImplementation,
      args: { behavior_implementation_name: 'zbi' },
      identity: { behavior_implementation_name: 'ZBI' },
      source: 'BEHAVIOR IMPLEMENTATION SOURCE MARKER (no fixture)',
      metadata: 'BEHAVIOR IMPLEMENTATION METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadBehaviorDefinition',
      handler: handleReadBehaviorDefinition,
      args: { behavior_definition_name: 'zbd' },
      identity: { behavior_definition_name: 'ZBD' },
      source: 'BEHAVIOR DEFINITION SOURCE MARKER',
      metadata: corpusBody(
        'read-metadata-behavior-definition--01-behaviordefinitions-zmcpshriroot',
      ),
    },
  ])('$name answers source_code from read and metadata from readMetadata, not swapped', async ({
    handler,
    args,
    identity,
    source,
    metadata,
  }) => {
    fakeClient = fakeClientOf({
      read: async () => okResponse(reading(source)),
      readMetadata: async () => okResponse(reading(metadata)),
    });

    const result: any = await (handler as any)(context as any, args);

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.source_code).toBe(source);
    expect(payload.metadata).toBe(metadata);
    for (const [field, expected] of Object.entries(identity)) {
      expect(payload[field]).toBe(expected);
    }
  });

  // Domain, DataElement, Package and FunctionGroup have no source resource
  // of their own — adt-clients 19 dropped `read` from their contracts
  // because `read` and `readMetadata` fetched the identical document (see
  // each handler's own comment). One call, and both `source_code` and
  // `metadata` in the answer are that one document.
  it.each([
    {
      name: 'ReadDomain',
      handler: handleReadDomain,
      args: { domain_name: 'zd' },
      identity: { domain_name: 'ZD' },
      metadata: 'DOMAIN METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadDataElement',
      handler: handleReadDataElement,
      args: { data_element_name: 'zde' },
      identity: { data_element_name: 'ZDE' },
      metadata: 'DATA ELEMENT METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadPackage',
      handler: handleReadPackage,
      args: { package_name: 'zpkg' },
      identity: { package_name: 'ZPKG' },
      metadata: corpusBody('read-metadata-package--01-packages-zmcpshrpkg'),
    },
    {
      name: 'ReadFunctionGroup',
      handler: handleReadFunctionGroup,
      args: { function_group_name: 'zfg' },
      identity: { function_group_name: 'ZFG' },
      metadata: corpusBody(
        'read-metadata-function-group--01-groups-zmcpshrfgrp',
      ),
    },
  ])('$name answers source_code and metadata from the single readMetadata call', async ({
    handler,
    args,
    identity,
    metadata,
  }) => {
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(reading(metadata)),
    });

    const result: any = await (handler as any)(context as any, args);

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.source_code).toBe(metadata);
    expect(payload.metadata).toBe(metadata);
    for (const [field, expected] of Object.entries(identity)) {
      expect(payload[field]).toBe(expected);
    }
  });

  // ReadPackage is the one handler in the single-readMetadata-call group
  // where `version` is not inert: AdtPackage forwards it into the query
  // string the same way `read`'s positional argument used to (Domain,
  // DataElement and FunctionGroup ignore it at every level, so their
  // `version` stays an echo only). `recordAnalyse` inspects the actual call
  // arguments, which is the only way to prove a parameter arrived — the
  // answer's echoed `version` field proves nothing, since the handler could
  // echo the caller's argument back without ever forwarding it.
  it('ReadPackage passes the caller-requested version to readMetadata', async () => {
    const seen = recordAnalyse();
    fakeClient = seen.client;

    await handleReadPackage(context as any, {
      package_name: 'zpkg',
      version: 'inactive',
    });

    const call = seen.calls.filter((c) => c.member === 'readMetadata').at(-1);
    const options = call?.args.at(-1) as { version?: string } | undefined;
    expect(options?.version).toBe('inactive');
  });

  // FunctionModule reads metadata FIRST (to verify the caller's group
  // against `containerRef`) and source second, the reverse order of every
  // sibling above — its own test, so the [metadata, source] tuple order is
  // exercised rather than assumed.
  it('ReadFunctionModule answers source_code from read and metadata from readMetadata, not swapped', async () => {
    const source = corpusBody(
      'read-function-module-source-text--01-read-source',
    );
    const metadata = corpusBody(
      'read-metadata-function-module--01-fmodules-zmcpshrfm',
    );
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(reading(metadata)),
      read: async () => okResponse(reading(source)),
    });

    const result: any = await handleReadFunctionModule(context as any, {
      function_module_name: 'z_mcp_shr_fm',
      function_group_name: 'zmcp_shr_fgrp',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.source_code).toBe(source);
    expect(payload.metadata).toBe(metadata);
    expect(payload.function_module_name).toBe('Z_MCP_SHR_FM');
    expect(payload.function_group_name).toBe('ZMCP_SHR_FGRP');
  });

  // The group-match check itself: deleting `assertFunctionGroupMatches` from
  // the handler does not fail the test above (it supplies the real group),
  // so it is pinned separately. The metadata's own containerRef names
  // ZMCP_SHR_FGRP; the caller asks for a different group, and `read` must
  // never be reached. If the check were removed, `read`'s stub answer below
  // would come back as a success instead.
  it('ReadFunctionModule refuses when the caller-supplied group does not match the metadata containerRef', async () => {
    const metadata = corpusBody(
      'read-metadata-function-module--01-fmodules-zmcpshrfm',
    );
    fakeClient = fakeClientOf({
      readMetadata: async () => okResponse(reading(metadata)),
      read: async () => okResponse(reading('SHOULD NOT BE READ')),
    });

    const result: any = await handleReadFunctionModule(context as any, {
      function_module_name: 'z_mcp_shr_fm',
      function_group_name: 'zwrong_group',
    });

    expect(result.isError).toBe(true);
  });

  // The PROG/P gate itself: neither the refusal rows in
  // readHandlersSurfaceErrors.test.ts nor the success row above exercises
  // it (a refusal short-circuits before it runs; the success row's metadata
  // is already typed PROG/P). Deleting the gate from the handler would
  // answer this with success:true and the include's source/metadata, so it
  // is pinned here on its own.
  it('ReadProgram refuses a non-PROG/P object as invalid_object_type', async () => {
    fakeClient = fakeClientOf({
      read: async () => okResponse(reading('INCLUDE SOURCE')),
      readMetadata: async () =>
        okResponse(reading('<a adtcore:type="PROG/I"/>')),
    });

    const result: any = await handleReadProgram(context as any, {
      program_name: 'zinc',
    });

    expect(result.isError).toBe(false);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.error).toBe('invalid_object_type');
    expect(payload.object_type).toBe('PROG/I');
  });
});
