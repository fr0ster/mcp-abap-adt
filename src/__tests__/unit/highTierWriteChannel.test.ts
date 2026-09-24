/**
 * One table over all eighteen high-tier locked writes: per handler, which
 * factory it reaches and which field the body actually lands in — the
 * `options.source` field for every write that carries a body — source text or
 * metadata document alike — and `config.description` for a create that only
 * names the object.
 *
 * **One channel, since `interfaces-adt@9`.** There were two: `options.
 * sourceCode` for ABAP text and `config.document` for an XML metadata
 * document, split by what the body happened to contain. The contract merged
 * them into `options.source` (decision 33), so a metadata write that still
 * passed `config.document` would now send no body at all — which is what this
 * table catches.
 *
 * `fakeClientOf`'s own doc comment names the exact defect this guards
 * against: its outer proxy ignores the factory name, so a handler that
 * called the wrong family's factory — `getPackage()` where `getDataElement()`
 * belonged — would still read and write through the double without a single
 * assertion noticing, because two families can share an identical
 * `{readMetadata, updateMetadata}` member shape. `fakeClientOfWithFactory`
 * is the double built for exactly this; the settled low tier
 * (`lowTierStrategies.test.ts`) already asserts `factory` the same way.
 */

import { handleCreateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleCreateBehaviorDefinition';
import { handleUpdateBehaviorDefinition } from '../../handlers/behavior_definition/high/handleUpdateBehaviorDefinition';
import { handleUpdateClass } from '../../handlers/class/high/handleUpdateClass';
import { handleCreateDataElement } from '../../handlers/data_element/high/handleCreateDataElement';
import { handleUpdateDataElement } from '../../handlers/data_element/high/handleUpdateDataElement';
import { handleUpdateDdl } from '../../handlers/ddl/high/handleUpdateDdl';
import { handleCreateMetadataExtension } from '../../handlers/ddlx/high/handleCreateMetadataExtension';
import { handleUpdateMetadataExtension } from '../../handlers/ddlx/high/handleUpdateMetadataExtension';
import { handleCreateDomain } from '../../handlers/domain/high/handleCreateDomain';
import { handleUpdateDomain } from '../../handlers/domain/high/handleUpdateDomain';
import { handleUpdateFunctionGroup } from '../../handlers/function/high/handleUpdateFunctionGroup';
import { handleUpdateFunctionModule } from '../../handlers/function/high/handleUpdateFunctionModule';
import { handleUpdateInterface } from '../../handlers/interface/high/handleUpdateInterface';
import { handleUpdateProgram } from '../../handlers/program/high/handleUpdateProgram';
import { handleUpdateServiceDefinition } from '../../handlers/service_definition/high/handleUpdateServiceDefinition';
import { handleCreateStructure } from '../../handlers/structure/high/handleCreateStructure';
import { handleUpdateStructure } from '../../handlers/structure/high/handleUpdateStructure';
import { handleUpdateTable } from '../../handlers/table/high/handleUpdateTable';
import {
  fakeClientOfWithFactory,
  okResponse,
  reading,
} from '../helpers/fakeClient';

let fakeClient: unknown;
jest.mock('../../lib/clients', () => ({ createAdtClient: () => fakeClient }));

const context = {
  connection: { getSessionId: () => null } as any,
  logger: undefined,
};

/** Every member neither this file nor a specific case names answers success. */
function baseMembers() {
  return {
    validate: async () => okResponse(reading({})),
    create: async () => okResponse(reading(undefined, '', 200)),
    lock: async () => okResponse('LOCK1'),
    unlock: async () => okResponse(undefined),
    check: async () => okResponse(reading({})),
    activate: async () => okResponse(reading({})),
  };
}

const DATAELEMENT_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZDT_X" ' +
  'adtcore:description="before">' +
  '<dtel:typeKind>domain</dtel:typeKind>' +
  '<dtel:typeName></dtel:typeName>' +
  '<dtel:dataType>CHAR</dtel:dataType>' +
  '<dtel:dataTypeLength>000010</dtel:dataTypeLength>' +
  '<dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals>' +
  '</blue:wbobj>';

const DOMAIN_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZD" ' +
  'adtcore:description="before">' +
  '<doma:datatype>CHAR</doma:datatype>' +
  '<doma:length>10</doma:length>' +
  '<doma:decimals>0</doma:decimals>' +
  '<doma:conversionExit/>' +
  '<doma:signExists>false</doma:signExists>' +
  '<doma:lowercase>false</doma:lowercase>' +
  '<doma:valueTableRef/>' +
  '<doma:fixValues/>' +
  '</doma:domain>';

const FUNCTIONGROUP_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<group:abapFunctionGroup xmlns:group="http://www.sap.com/adt/functions/groups" ' +
  'xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZFG_X" ' +
  'adtcore:description="before"/>';

interface Captured {
  factory?: string;
  config: any;
  options: any;
}

interface WireCase {
  name: string;
  expectFactory: string;
  /** 'options' for any write that carries a body, 'config' for a create's description. */
  channel: 'options' | 'config';
  field: string;
  marker: string;
  run: () => Promise<Captured>;
}

/** Matches `fakeClient.ts`'s own (unexported) `Members` shape. */
type AnyMembers = Record<string, (...args: unknown[]) => unknown>;

function capture(
  extra: AnyMembers,
  target: string,
): { members: AnyMembers; captured: () => Captured['config'] } {
  let seen: { config: any; options: any } = {
    config: undefined,
    options: undefined,
  };
  const members: AnyMembers = {
    ...baseMembers(),
    ...extra,
    [target]: async (config: unknown, options?: unknown) => {
      seen = { config, options };
      return okResponse(reading(undefined, '', 200));
    },
  };
  return { members, captured: () => seen };
}

const cases: WireCase[] = [
  {
    name: 'UpdateClass',
    expectFactory: 'getClass',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_CLASS',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateClass(context as any, {
        class_name: 'ZCL_X',
        source_code: 'MARKER_CLASS',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateDdl',
    expectFactory: 'getDdl',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_DDL',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateDdl(context as any, {
        ddl_name: 'ZR_X',
        ddl_source: 'MARKER_DDL',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'CreateMetadataExtension',
    expectFactory: 'getMetadataExtension',
    channel: 'config',
    field: 'description',
    marker: 'MARKER_DDLX_CREATE',
    run: async () => {
      const { members, captured } = capture({}, 'create');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleCreateMetadataExtension(context as any, {
        name: 'ZI_X',
        package_name: 'ZP',
        description: 'MARKER_DDLX_CREATE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateMetadataExtension',
    expectFactory: 'getMetadataExtension',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_DDLX_UPDATE',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateMetadataExtension(context as any, {
        name: 'ZI_X',
        source_code: 'MARKER_DDLX_UPDATE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'CreateBehaviorDefinition',
    expectFactory: 'getBehaviorDefinition',
    channel: 'config',
    field: 'description',
    marker: 'MARKER_BDEF_CREATE',
    run: async () => {
      const { members, captured } = capture({}, 'create');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleCreateBehaviorDefinition(context as any, {
        name: 'ZI_X',
        package_name: 'ZP',
        root_entity: 'ZI_ROOT',
        implementation_type: 'Managed',
        description: 'MARKER_BDEF_CREATE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateBehaviorDefinition',
    expectFactory: 'getBehaviorDefinition',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_BDEF_UPDATE',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateBehaviorDefinition(context as any, {
        name: 'ZI_X',
        source_code: 'MARKER_BDEF_UPDATE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'CreateDomain',
    expectFactory: 'getDomain',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_DOMAIN_CREATE',
    run: async () => {
      const { members, captured } = capture(
        { readMetadata: async () => okResponse(reading(DOMAIN_XML)) },
        'updateMetadata',
      );
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleCreateDomain(context as any, {
        domain_name: 'ZD',
        package_name: 'ZP',
        description: 'MARKER_DOMAIN_CREATE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateDomain',
    expectFactory: 'getDomain',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_DOMAIN_UPDATE',
    run: async () => {
      const { members, captured } = capture(
        { readMetadata: async () => okResponse(reading(DOMAIN_XML)) },
        'updateMetadata',
      );
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateDomain(context as any, {
        domain_name: 'ZD',
        package_name: 'ZP',
        description: 'MARKER_DOMAIN_UPDATE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'CreateDataElement',
    expectFactory: 'getDataElement',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_DTEL_CREATE',
    run: async () => {
      const { members, captured } = capture(
        { readMetadata: async () => okResponse(reading(DATAELEMENT_XML)) },
        'updateMetadata',
      );
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleCreateDataElement(context as any, {
        data_element_name: 'ZDT_X',
        package_name: 'ZP',
        description: 'MARKER_DTEL_CREATE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateDataElement',
    expectFactory: 'getDataElement',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_DTEL_UPDATE',
    run: async () => {
      const { members, captured } = capture(
        { readMetadata: async () => okResponse(reading(DATAELEMENT_XML)) },
        'updateMetadata',
      );
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateDataElement(context as any, {
        data_element_name: 'ZDT_X',
        package_name: 'ZP',
        description: 'MARKER_DTEL_UPDATE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateFunctionGroup',
    expectFactory: 'getFunctionGroup',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_FG',
    run: async () => {
      const { members, captured } = capture(
        { readMetadata: async () => okResponse(reading(FUNCTIONGROUP_XML)) },
        'updateMetadata',
      );
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateFunctionGroup(context as any, {
        function_group_name: 'ZFG_X',
        description: 'MARKER_FG',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateFunctionModule',
    expectFactory: 'getFunctionModule',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_FM',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateFunctionModule(context as any, {
        function_group_name: 'ZFG_X',
        function_module_name: 'Z_FM_X',
        source_code: 'MARKER_FM',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateInterface',
    expectFactory: 'getInterface',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_INTF',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateInterface(context as any, {
        interface_name: 'ZIF_X',
        source_code: 'MARKER_INTF',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateProgram',
    expectFactory: 'getProgram',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_PROG',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateProgram(context as any, {
        program_name: 'Z_PROG_X',
        source_code: 'MARKER_PROG',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateServiceDefinition',
    expectFactory: 'getServiceDefinition',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_SRVD',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateServiceDefinition(context as any, {
        service_definition_name: 'ZSD_X',
        source_code: 'MARKER_SRVD',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'CreateStructure',
    expectFactory: 'getStructure',
    channel: 'config',
    field: 'description',
    marker: 'MARKER_STRUCT_CREATE',
    run: async () => {
      const { members, captured } = capture({}, 'create');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleCreateStructure(context as any, {
        structure_name: 'ZS_X',
        package_name: 'ZP',
        description: 'MARKER_STRUCT_CREATE',
        fields: [{ name: 'CLIENT' }],
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateStructure',
    expectFactory: 'getStructure',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_STRUCT_UPDATE',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateStructure(context as any, {
        structure_name: 'ZS_X',
        ddl_code: 'MARKER_STRUCT_UPDATE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
  {
    name: 'UpdateTable',
    expectFactory: 'getTable',
    channel: 'options',
    field: 'source',
    marker: 'MARKER_TABLE',
    run: async () => {
      const { members, captured } = capture({}, 'update');
      const double = fakeClientOfWithFactory(members);
      fakeClient = double.client;
      await handleUpdateTable(context as any, {
        table_name: 'ZT_X',
        ddl_code: 'MARKER_TABLE',
      });
      return { factory: double.factory, ...captured() };
    },
  },
];

describe('wire channel: every high-tier locked write lands where its shipped member reads it', () => {
  it.each(cases)(
    '$name reaches $expectFactory and lands in $channel.$field',
    async (c) => {
      const result = await c.run();
      expect(result.factory).toBe(c.expectFactory);
      const half = c.channel === 'options' ? result.options : result.config;
      expect(String(half?.[c.field] ?? '')).toContain(c.marker);
    },
  );
});
