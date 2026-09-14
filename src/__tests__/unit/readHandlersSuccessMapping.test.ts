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
import { fakeClientOf, okResponse, reading } from '../helpers/fakeClient';

let fakeClient: any;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = { connection: {} as any, logger: undefined };

describe('readonly handlers map a success into the right fields, not swapped', () => {
  it.each([
    {
      name: 'ReadTable',
      handler: handleReadTable,
      args: { table_name: 'zt' },
      identity: { field: 'table_name', expected: 'ZT' },
      source: 'TABLE SOURCE MARKER',
      metadata: corpusBody(
        'read-table-metadata-structure--01-tables-zmcpshrrtabl',
      ),
    },
    {
      name: 'ReadStructure',
      handler: handleReadStructure,
      args: { structure_name: 'zs' },
      identity: { field: 'structure_name', expected: 'ZS' },
      source: 'STRUCTURE SOURCE MARKER',
      metadata: corpusBody(
        'read-metadata-structure--01-structures-zmcpshrstru',
      ),
    },
    {
      name: 'ReadServiceDefinition',
      handler: handleReadServiceDefinition,
      args: { service_definition_name: 'zsd' },
      identity: { field: 'service_definition_name', expected: 'ZSD' },
      source: 'SERVICE DEFINITION SOURCE MARKER',
      metadata: corpusBody(
        'read-metadata-service-definition--01-sources-zmcpshrsrvd01',
      ),
    },
    {
      name: 'ReadServiceBinding',
      handler: handleReadServiceBinding,
      args: { service_binding_name: 'zsb' },
      identity: { field: 'service_binding_name', expected: 'ZSB' },
      source: 'SERVICE BINDING SOURCE MARKER (no fixture)',
      metadata: 'SERVICE BINDING METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadProgram',
      handler: handleReadProgram,
      args: { program_name: 'zp' },
      identity: { field: 'program_name', expected: 'ZP' },
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
      identity: { field: 'metadata_extension_name', expected: 'ZME' },
      source: 'METADATA EXTENSION SOURCE MARKER (no fixture)',
      metadata: 'METADATA EXTENSION METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadInterface',
      handler: handleReadInterface,
      args: { interface_name: 'zif' },
      identity: { field: 'interface_name', expected: 'ZIF' },
      source: 'INTERFACE SOURCE MARKER (no fixture)',
      metadata: 'INTERFACE METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadFunctionInclude',
      handler: handleReadFunctionInclude,
      args: { function_group_name: 'zfg', include_name: 'zinc' },
      identity: { field: 'include_name', expected: 'ZINC' },
      source: 'FUNCTION INCLUDE SOURCE MARKER (no fixture)',
      metadata: 'FUNCTION INCLUDE METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadDdl',
      handler: handleReadDdl,
      args: { ddl_name: 'zddl' },
      identity: { field: 'ddl_name', expected: 'ZDDL' },
      source: 'DDL SOURCE MARKER',
      metadata: corpusBody('read-metadata-ddl--01-sources-zmcpshriroot'),
    },
    {
      name: 'ReadBehaviorImplementation',
      handler: handleReadBehaviorImplementation,
      args: { behavior_implementation_name: 'zbi' },
      identity: { field: 'behavior_implementation_name', expected: 'ZBI' },
      source: 'BEHAVIOR IMPLEMENTATION SOURCE MARKER (no fixture)',
      metadata: 'BEHAVIOR IMPLEMENTATION METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadBehaviorDefinition',
      handler: handleReadBehaviorDefinition,
      args: { behavior_definition_name: 'zbd' },
      identity: { field: 'behavior_definition_name', expected: 'ZBD' },
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
    expect(payload[identity.field]).toBe(identity.expected);
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
      identity: { field: 'domain_name', expected: 'ZD' },
      metadata: 'DOMAIN METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadDataElement',
      handler: handleReadDataElement,
      args: { data_element_name: 'zde' },
      identity: { field: 'data_element_name', expected: 'ZDE' },
      metadata: 'DATA ELEMENT METADATA MARKER (no fixture)',
    },
    {
      name: 'ReadPackage',
      handler: handleReadPackage,
      args: { package_name: 'zpkg' },
      identity: { field: 'package_name', expected: 'ZPKG' },
      metadata: corpusBody('read-metadata-package--01-packages-zmcpshrpkg'),
    },
    {
      name: 'ReadFunctionGroup',
      handler: handleReadFunctionGroup,
      args: { function_group_name: 'zfg' },
      identity: { field: 'function_group_name', expected: 'ZFG' },
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
    expect(payload[identity.field]).toBe(identity.expected);
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
});
