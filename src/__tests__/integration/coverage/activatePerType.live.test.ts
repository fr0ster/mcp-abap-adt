/**
 * The per-type Activate tools, live: each activates a good object of the
 * case's own, created (and, where it has a source, written) inactive, in
 * the package the coverage suites create in (`ownPackage`) — every name
 * read free first and recorded for cleanup before its create. Each answer
 * is a success, and the object then reads in its active version. The
 * cleanup deletes everything recorded, children first, and reads each
 * absent. The program is on premise only (the cloud has none).
 *
 * The CDS objects build on the shared tables and views (read only): the
 * view entity selects from a shared table, the service definition exposes a
 * shared view, the metadata extension annotates a shared projection on its
 * own layer (`#CORE`; the shared extension is `#CUSTOMER`), and the behavior
 * definition is a managed one, without an implementation class, for the
 * case's own root view entity.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, it } from 'node:test';
import {
  deleteRecorded,
  expectAbsent,
  expectNameFree,
  type LiveRead,
  liveCall,
  livePrepare,
  liveSuite,
  recordCreated,
} from '../helpers/live';
import { onRequest, ownPackage, succeeded } from './ownObjects';

const SUFFIX = randomBytes(2).toString('hex').toUpperCase();
const N = {
  domain: `ZMCP_AD_${SUFFIX}`,
  tableType: `ZMCP_AT_${SUFFIX}`,
  table: `ZMCP_ATB${SUFFIX}`,
  structure: `ZMCP_AS_${SUFFIX}`,
  ddl: `ZI_MCP_AV_${SUFFIX}`,
  root: `ZI_MCP_AR_${SUFFIX}`,
  interface: `ZIF_MCP_AI_${SUFFIX}`,
  group: `ZMCP_AG${SUFFIX}`,
  module: `Z_MCP_AM_${SUFFIX}`,
  program: `ZMCP_AP_${SUFFIX}`,
  service: `ZMCP_ASD_${SUFFIX}`,
  extension: `ZC_MCP_AX_${SUFFIX}`,
};

/** Reads `read` free, records its delete, then runs `create`. */
async function create(
  read: LiveRead,
  remove: { tool: string; args: Record<string, unknown> },
  createTool: string,
  createArgs: Record<string, unknown>,
): Promise<void> {
  await expectNameFree(read);
  recordCreated(remove.tool, { ...remove.args, ...onRequest() });
  succeeded(
    createTool,
    await livePrepare(createTool, { ...createArgs, ...onRequest() }),
  );
}

/** A write before the activation under test, left inactive. */
async function write(tool: string, args: Record<string, unknown>) {
  succeeded(
    tool,
    await livePrepare(tool, { ...args, activate: false, ...onRequest() }),
  );
}

/** The object reads in its active version. */
async function readsActive(read: LiveRead): Promise<void> {
  succeeded(
    `${read.tool} active`,
    await livePrepare(read.tool, { ...read.args, version: 'active' }),
  );
}

const DESCRIPTION = 'MCP per-type activation live case';

liveSuite(['onprem', 'cloud'], 'The per-type Activate tools', () => {
  after(async () => {
    await deleteRecorded();
    for (const read of [
      {
        tool: 'GetMetadataExtension',
        args: { metadata_extension_name: N.extension },
      },
      {
        tool: 'GetServiceDefinition',
        args: { service_definition_name: N.service },
      },
      {
        tool: 'GetBehaviorDefinition',
        args: { behavior_definition_name: N.root },
      },
      { tool: 'GetDdl', args: { ddl_name: N.root } },
      { tool: 'GetDdl', args: { ddl_name: N.ddl } },
      { tool: 'GetFunctionGroup', args: { function_group_name: N.group } },
      { tool: 'GetInterface', args: { interface_name: N.interface } },
      { tool: 'GetStructure', args: { structure_name: N.structure } },
      { tool: 'GetTable', args: { table_name: N.table } },
      { tool: 'GetTableType', args: { table_type_name: N.tableType } },
      { tool: 'GetDomain', args: { domain_name: N.domain } },
    ]) {
      await expectAbsent(read);
    }
  });

  it('ActivateDomain activates a domain of its own', async () => {
    const read = { tool: 'GetDomain', args: { domain_name: N.domain } };
    await create(
      read,
      { tool: 'DeleteDomain', args: { domain_name: N.domain } },
      'CreateDomain',
      {
        domain_name: N.domain,
        description: DESCRIPTION,
        package_name: ownPackage(),
        datatype: 'CHAR',
        length: 5,
        activate: false,
      },
    );
    const activated = await liveCall('ActivateDomain', {
      domain_name: N.domain,
    });
    succeeded('ActivateDomain', activated);
    await readsActive(read);
  });

  it('ActivateTableType activates a table type of its own', async () => {
    const read = {
      tool: 'GetTableType',
      args: { table_type_name: N.tableType },
    };
    await create(
      read,
      { tool: 'DeleteTableType', args: { table_type_name: N.tableType } },
      'CreateTableType',
      {
        table_type_name: N.tableType,
        package_name: ownPackage(),
        description: DESCRIPTION,
        row_type_kind: 'dictionaryType',
        row_type_name: 'ABAP_BOOLEAN',
        access_type: 'standard',
        key_definition: 'standard',
        key_kind: 'nonUnique',
        activate: false,
      },
    );
    const activated = await liveCall('ActivateTableType', {
      table_type_name: N.tableType,
    });
    succeeded('ActivateTableType', activated);
    await readsActive(read);
  });

  it('ActivateTable activates a table of its own', async () => {
    const read = { tool: 'GetTable', args: { table_name: N.table } };
    await create(
      read,
      { tool: 'DeleteTable', args: { table_name: N.table } },
      'CreateTable',
      {
        table_name: N.table,
        description: DESCRIPTION,
        package_name: ownPackage(),
      },
    );
    await write('UpdateTable', {
      table_name: N.table,
      ddl_code: [
        `@EndUserText.label : '${DESCRIPTION}'`,
        '@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE',
        '@AbapCatalog.tableCategory : #TRANSPARENT',
        '@AbapCatalog.deliveryClass : #A',
        '@AbapCatalog.dataMaintenance : #RESTRICTED',
        `define table ${N.table.toLowerCase()} {`,
        '  key client : abap.clnt not null;',
        '  key id     : abap.char(10) not null;',
        '  name       : abap.char(30);',
        '}',
      ].join('\n'),
    });
    const activated = await liveCall('ActivateTable', { table_name: N.table });
    succeeded('ActivateTable', activated);
    await readsActive(read);
  });

  it('ActivateStructure activates a structure of its own', async () => {
    const read = {
      tool: 'GetStructure',
      args: { structure_name: N.structure },
    };
    await create(
      read,
      { tool: 'DeleteStructure', args: { structure_name: N.structure } },
      'CreateStructure',
      {
        structure_name: N.structure,
        description: DESCRIPTION,
        package_name: ownPackage(),
        fields: [
          { name: 'ID', data_type: 'CHAR', length: 10 },
          { name: 'NAME', data_type: 'CHAR', length: 30 },
        ],
        activate: false,
      },
    );
    const activated = await liveCall('ActivateStructure', {
      structure_name: N.structure,
    });
    succeeded('ActivateStructure', activated);
    await readsActive(read);
  });

  it('ActivateDdl activates a CDS view entity of its own', async () => {
    const read = { tool: 'GetDdl', args: { ddl_name: N.ddl } };
    await create(
      read,
      { tool: 'DeleteDdl', args: { ddl_name: N.ddl } },
      'CreateDdl',
      {
        ddl_name: N.ddl,
        package_name: ownPackage(),
        description: DESCRIPTION,
      },
    );
    await write('UpdateDdl', {
      ddl_name: N.ddl,
      ddl_source: [
        `@EndUserText.label : '${DESCRIPTION}'`,
        '@AccessControl.authorizationCheck : #NOT_REQUIRED',
        `define view entity ${N.ddl} as select from zmcp_shr_rtabl`,
        '{',
        '  key fld1 as Fld1,',
        '  fld2 as Fld2',
        '}',
      ].join('\n'),
    });
    const activated = await liveCall('ActivateDdl', { ddl_name: N.ddl });
    succeeded('ActivateDdl', activated);
    await readsActive(read);
  });

  it('ActivateInterface activates an interface of its own', async () => {
    const read = {
      tool: 'GetInterface',
      args: { interface_name: N.interface },
    };
    await create(
      read,
      { tool: 'DeleteInterface', args: { interface_name: N.interface } },
      'CreateInterface',
      {
        interface_name: N.interface,
        description: DESCRIPTION,
        package_name: ownPackage(),
      },
    );
    await write('UpdateInterface', {
      interface_name: N.interface,
      source_code: [
        `INTERFACE ${N.interface.toLowerCase()} PUBLIC.`,
        '  METHODS run.',
        'ENDINTERFACE.',
      ].join('\n'),
    });
    const activated = await liveCall('ActivateInterface', {
      interface_name: N.interface,
    });
    succeeded('ActivateInterface', activated);
    await readsActive(read);
  });

  it('ActivateFunctionGroup and ActivateFunctionModule activate a group and its module', async () => {
    const group = {
      tool: 'GetFunctionGroup',
      args: { function_group_name: N.group },
    };
    await create(
      group,
      { tool: 'DeleteFunctionGroup', args: { function_group_name: N.group } },
      'CreateFunctionGroup',
      {
        function_group_name: N.group,
        description: DESCRIPTION,
        package_name: ownPackage(),
        activate: false,
      },
    );
    const activatedGroup = await liveCall('ActivateFunctionGroup', {
      function_group_name: N.group,
    });
    succeeded('ActivateFunctionGroup', activatedGroup);
    recordCreated('DeleteFunctionModule', {
      function_module_name: N.module,
      function_group_name: N.group,
      ...onRequest(),
    });
    succeeded(
      'CreateFunctionModule',
      await livePrepare('CreateFunctionModule', {
        function_group_name: N.group,
        function_module_name: N.module,
        description: DESCRIPTION,
        ...onRequest(),
      }),
    );
    await write('UpdateFunctionModule', {
      function_group_name: N.group,
      function_module_name: N.module,
      source_code: `FUNCTION ${N.module.toLowerCase()}.\nENDFUNCTION.`,
    });
    const activatedModule = await liveCall('ActivateFunctionModule', {
      function_module_name: N.module,
      function_group_name: N.group,
    });
    succeeded('ActivateFunctionModule', activatedModule);
    await readsActive({
      tool: 'GetFunctionModule',
      args: { function_module_name: N.module, function_group_name: N.group },
    });
  });

  it('ActivateServiceDefinition activates a service definition of its own', async () => {
    const read = {
      tool: 'GetServiceDefinition',
      args: { service_definition_name: N.service },
    };
    await create(
      read,
      {
        tool: 'DeleteServiceDefinition',
        args: { service_definition_name: N.service },
      },
      'CreateServiceDefinition',
      {
        service_definition_name: N.service,
        description: DESCRIPTION,
        package_name: ownPackage(),
        source_code: [
          `@EndUserText.label: '${DESCRIPTION}'`,
          `define service ${N.service} {`,
          '  expose ZMCP_SHR_C_ROOT as Root;',
          '}',
        ].join('\n'),
        activate: false,
      },
    );
    const activated = await liveCall('ActivateServiceDefinition', {
      name: N.service,
    });
    succeeded('ActivateServiceDefinition', activated);
    await readsActive(read);
  });

  it('ActivateMetadataExtension activates a metadata extension of its own', async () => {
    const read = {
      tool: 'GetMetadataExtension',
      args: { metadata_extension_name: N.extension },
    };
    await create(
      read,
      {
        tool: 'DeleteMetadataExtension',
        args: { metadata_extension_name: N.extension },
      },
      'CreateMetadataExtension',
      {
        name: N.extension,
        description: DESCRIPTION,
        package_name: ownPackage(),
        activate: false,
      },
    );
    await write('UpdateMetadataExtension', {
      name: N.extension,
      source_code: [
        '@Metadata.layer: #CORE',
        'annotate entity ZMCP_SHR_C_ROOT with',
        '{',
        "  @EndUserText.label: 'Root field 1'",
        '  Fld1;',
        '}',
      ].join('\n'),
    });
    const activated = await liveCall('ActivateMetadataExtension', {
      name: N.extension,
    });
    succeeded('ActivateMetadataExtension', activated);
    await readsActive(read);
  });

  it('ActivateBehaviorDefinition activates a behavior definition of its own', async () => {
    await create(
      { tool: 'GetDdl', args: { ddl_name: N.root } },
      { tool: 'DeleteDdl', args: { ddl_name: N.root } },
      'CreateDdl',
      {
        ddl_name: N.root,
        package_name: ownPackage(),
        description: DESCRIPTION,
      },
    );
    succeeded(
      'UpdateDdl root',
      await livePrepare('UpdateDdl', {
        ddl_name: N.root,
        ddl_source: [
          `@EndUserText.label : '${DESCRIPTION}'`,
          '@AccessControl.authorizationCheck : #NOT_REQUIRED',
          `define root view entity ${N.root} as select from zmcp_shr_btabl`,
          '{',
          '  key fld1 as Fld1,',
          '  fld2 as Fld2',
          '}',
        ].join('\n'),
        activate: true,
        ...onRequest(),
      }),
    );
    const read = {
      tool: 'GetBehaviorDefinition',
      args: { behavior_definition_name: N.root },
    };
    await create(
      read,
      {
        tool: 'DeleteBehaviorDefinition',
        args: { behavior_definition_name: N.root },
      },
      'CreateBehaviorDefinition',
      {
        name: N.root,
        description: DESCRIPTION,
        package_name: ownPackage(),
        root_entity: N.root,
        implementation_type: 'Managed',
        activate: false,
      },
    );
    await write('UpdateBehaviorDefinition', {
      name: N.root,
      source_code: [
        'managed;',
        `define behavior for ${N.root}`,
        'persistent table zmcp_shr_btabl',
        'lock master',
        '{',
        '  create;',
        '  update;',
        '  delete;',
        '  field ( readonly ) Fld1;',
        '}',
      ].join('\n'),
    });
    const activated = await liveCall('ActivateBehaviorDefinition', {
      name: N.root,
    });
    succeeded('ActivateBehaviorDefinition', activated);
    await readsActive(read);
  });
});

liveSuite(['onprem'], 'ActivateProgram', () => {
  after(async () => {
    await deleteRecorded();
    await expectAbsent({
      tool: 'GetProgram',
      args: { program_name: N.program },
    });
  });

  it('ActivateProgram activates a program of its own', async () => {
    const read = { tool: 'GetProgram', args: { program_name: N.program } };
    await create(
      read,
      { tool: 'DeleteProgram', args: { program_name: N.program } },
      'CreateProgram',
      {
        program_name: N.program,
        description: DESCRIPTION,
        package_name: ownPackage(),
      },
    );
    await write('UpdateProgram', {
      program_name: N.program,
      source_code: `REPORT ${N.program.toLowerCase()}.\nWRITE / 'activated'.`,
    });
    const activated = await liveCall('ActivateProgram', {
      program_name: N.program,
    });
    succeeded('ActivateProgram', activated);
    assert.ok(activated.text.length > 0);
    await readsActive(read);
  });
});
