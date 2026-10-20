/**
 * The object types the probe runs its cycle on — how each is reached, named,
 * configured and written — and why every other operation with a default
 * pair is skipped.
 */

import type { AdtClient } from '@mcp-abap-adt/adt-clients';

/** What a spec needs to build a config. */
export interface ISpecContext {
  packageName: string;
  transportRequest: string;
  /** The dependency's name: the function group, or the DDL source. */
  parent?: string;
}

/** A handler as the probe calls it: every member by name. */
export type IProbeable = Record<
  string,
  ((...args: unknown[]) => Promise<unknown>) | undefined
>;

export interface IObjectSpec {
  /** The report's object type, and the `--only` key. */
  type: string;
  /** Two letters that keep the probe's names apart across types. */
  code: string;
  /** Function modules must start with `Z_`. */
  functionModule?: boolean;
  /** Created first, deleted last. */
  needs?: 'functionGroup' | 'ddl';
  handle(client: AdtClient): IProbeable;
  config(name: string, context: ISpecContext): Record<string, unknown>;
  /**
   * How the update phase writes: `update` with a source, `updateMetadata` with
   * the metadata document read back as it is.
   */
  write: 'source' | 'metadata';
  /** The source to write; without one the source read is written back unchanged. */
  source?(name: string, context: ISpecContext): string;
}

const as = (handler: unknown): IProbeable => handler as IProbeable;

const LABEL = "@EndUserText.label: 'Header probe'";

const base = (context: ISpecContext, description = 'Header probe') => ({
  packageName: context.packageName,
  transportRequest: context.transportRequest,
  description,
});

export const OBJECT_SPECS: readonly IObjectSpec[] = [
  {
    type: 'class',
    code: 'CL',
    handle: (client) => as(client.getClass()),
    config: (name, context) => ({ className: name, ...base(context) }),
    write: 'source',
  },
  {
    type: 'interface',
    code: 'IF',
    handle: (client) => as(client.getInterface()),
    config: (name, context) => ({ interfaceName: name, ...base(context) }),
    write: 'source',
  },
  {
    type: 'program',
    code: 'PR',
    handle: (client) => as(client.getProgram()),
    config: (name, context) => ({
      programName: name,
      programType: 'executable',
      ...base(context),
    }),
    write: 'source',
  },
  {
    type: 'include',
    code: 'IN',
    handle: (client) => as(client.getInclude()),
    config: (name, context) => ({ includeName: name, ...base(context) }),
    write: 'source',
    source: () => '* Header probe',
  },
  {
    type: 'domain',
    code: 'DO',
    handle: (client) => as(client.getDomain()),
    config: (name, context) => ({ domainName: name, ...base(context) }),
    write: 'metadata',
  },
  {
    type: 'dataElement',
    code: 'DE',
    handle: (client) => as(client.getDataElement()),
    config: (name, context) => ({
      dataElementName: name,
      typeKind: 'predefinedAbapType',
      dataType: 'CHAR',
      length: 10,
      ...base(context),
    }),
    write: 'metadata',
  },
  {
    type: 'structure',
    code: 'ST',
    handle: (client) => as(client.getStructure()),
    config: (name, context) => ({ structureName: name, ...base(context) }),
    write: 'source',
    source: (name) =>
      `${LABEL}\n@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE\ndefine structure ${name.toLowerCase()} {\n  field1 : abap.char(1);\n}\n`,
  },
  {
    type: 'table',
    code: 'TA',
    handle: (client) => as(client.getTable()),
    config: (name, context) => ({ tableName: name, ...base(context) }),
    write: 'source',
    source: (name) =>
      `${LABEL}\n@AbapCatalog.enhancement.category: #NOT_EXTENSIBLE\n@AbapCatalog.tableCategory: #TRANSPARENT\n@AbapCatalog.deliveryClass: #A\n@AbapCatalog.dataMaintenance: #RESTRICTED\ndefine table ${name.toLowerCase()} {\n  key mandt : abap.clnt not null;\n  key id    : abap.char(10) not null;\n}\n`,
  },
  {
    type: 'tableType',
    code: 'TT',
    handle: (client) => as(client.getTableType()),
    config: (name, context) => ({ tableTypeName: name, ...base(context) }),
    write: 'metadata',
  },
  {
    type: 'ddl',
    code: 'DL',
    handle: (client) => as(client.getDdl()),
    config: (name, context) => ({ ddlName: name, ...base(context) }),
    write: 'source',
    source: (name) => ddlSource(name),
  },
  {
    type: 'functionGroup',
    code: 'FG',
    handle: (client) => as(client.getFunctionGroup()),
    config: (name, context) => ({ functionGroupName: name, ...base(context) }),
    write: 'metadata',
  },
  {
    type: 'functionModule',
    code: 'FM',
    functionModule: true,
    needs: 'functionGroup',
    handle: (client) => as(client.getFunctionModule()),
    config: (name, context) => ({
      functionGroupName: context.parent,
      functionModuleName: name,
      ...base(context),
    }),
    write: 'source',
  },
  {
    type: 'messageClass',
    code: 'MC',
    handle: (client) => as(client.getMessageClass()),
    config: (name, context) => ({ name, ...base(context) }),
    write: 'metadata',
  },
  {
    type: 'transformation',
    code: 'XT',
    handle: (client) => as(client.getTransformation()),
    config: (name, context) => ({
      transformationName: name,
      transformationType: 'SimpleTransformation',
      ...base(context),
    }),
    write: 'source',
    source: () =>
      '<?sap.transform simple?>\n<tt:transform xmlns:tt="http://www.sap.com/transformation-templates">\n  <tt:root name="ROOT"/>\n  <tt:template>\n    <root>\n      <tt:value ref="ROOT"/>\n    </root>\n  </tt:template>\n</tt:transform>\n',
  },
  {
    type: 'serviceDefinition',
    code: 'SD',
    needs: 'ddl',
    handle: (client) => as(client.getServiceDefinition()),
    config: (name, context) => ({
      serviceDefinitionName: name,
      ...base(context),
    }),
    write: 'source',
    source: (name, context) =>
      `${LABEL}\ndefine service ${name} {\n  expose ${context.parent};\n}\n`,
  },
  {
    type: 'accessControl',
    code: 'AC',
    needs: 'ddl',
    handle: (client) => as(client.getAccessControl()),
    config: (name, context) => ({ accessControlName: name, ...base(context) }),
    write: 'source',
    source: (name, context) =>
      `${LABEL}\n@MappingRole: true\ndefine role ${name} {\n  grant select on ${context.parent}\n  where ( ) = aspect pfcg_auth ( 'S_TABU_NAM', ACTVT = '03', TABLE = '${context.parent}' );\n}\n`,
  },
  {
    type: 'metadataExtension',
    code: 'MX',
    needs: 'ddl',
    handle: (client) => as(client.getMetadataExtension()),
    config: (name, context) => ({ name, ...base(context) }),
    write: 'source',
    source: (_name, context) =>
      `@Metadata.layer: #CORE\nannotate entity ${context.parent} with\n{\n  @EndUserText.label: 'Client'\n  mandt;\n}\n`,
  },
];

/** The DDL source of a view entity on T000, which every system has. */
export function ddlSource(name: string): string {
  return `${LABEL}\n@AccessControl.authorizationCheck: #NOT_REQUIRED\n@Metadata.allowExtensions: true\ndefine view entity ${name}\n  as select from t000\n{\n  key mandt,\n  mtext\n}\n`;
}

/** The class includes probed under the class's lock. */
export const LOCAL_INCLUDES: readonly {
  type: string;
  handle(client: AdtClient): IProbeable;
  source(className: string): string;
}[] = [
  {
    type: 'localTypes',
    handle: (client) => as(client.getLocalTypes()),
    source: () => '* Header probe',
  },
  {
    type: 'localDefinitions',
    handle: (client) => as(client.getLocalDefinitions()),
    source: () => '* Header probe',
  },
  {
    type: 'localMacros',
    handle: (client) => as(client.getLocalMacros()),
    source: () => '* Header probe',
  },
  {
    type: 'localTestClass',
    handle: (client) => as(client.getLocalTestClass()),
    source: () =>
      'CLASS ltc_probe DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.\n  PRIVATE SECTION.\n    METHODS probe FOR TESTING.\nENDCLASS.\n\nCLASS ltc_probe IMPLEMENTATION.\n  METHOD probe.\n  ENDMETHOD.\nENDCLASS.\n',
  },
];

/** The utilities the cycle probes, in order: reads first, then the group lifecycle on a program of its own. */
export const UTILS_READS = [
  'getWhereUsed',
  'getWhereUsedScope',
  'getVirtualFoldersContents',
  'fetchNodeStructure',
  'getSqlQuery',
  'getTableContents',
] as const;
export const UTILS_GROUP = [
  'activateObjectsGroup',
  'checkDeletionGroup',
  'deleteObjectsGroup',
] as const;

/** The members of an object type's cycle, in the order it runs them. */
export function cycleMembers(spec: IObjectSpec): string[] {
  return [
    'create',
    spec.write === 'source' ? 'update' : 'updateMetadata',
    'check',
    'activate',
    'checkDeletion',
    'delete',
  ];
}

/** Every `<object>.<member>` the cycle has a step for. */
export function cycleOperations(): string[] {
  const out: string[] = [];
  for (const spec of OBJECT_SPECS)
    for (const member of cycleMembers(spec)) out.push(`${spec.type}.${member}`);
  for (const local of LOCAL_INCLUDES)
    for (const member of ['update', 'delete', 'check', 'activate'])
      out.push(`${local.type}.${member}`);
  for (const member of ['create', 'update', 'delete'])
    out.push(`messageClassMessage.${member}`);
  for (const member of [...UTILS_READS, ...UTILS_GROUP])
    out.push(`utils.${member}`);
  return out;
}

const fixture = (what: string) =>
  `skipped: the cycle builds no ${what}, so this probe has nothing to run on`;

/**
 * Why the cycle has no step for an object type's operations. Each becomes a
 * `skipped:` row: they need something the cycle cannot make and remove again
 * on its own (a live debuggee, an external repository, a key the server
 * assigns), or a fixture it does not build.
 */
export const SKIP_REASONS: Readonly<Record<string, string>> = {
  debugger: 'skipped: needs a live debugging session attached to a debuggee',
  amdpDebugger: 'skipped: needs an AMDP debuggee stopped at a breakpoint',
  abapGit: 'skipped: needs an external Git repository to link',
  request:
    'skipped: the server assigns the request number, so a request a refused create made could not be found and removed',
  classExecutor:
    'skipped: the server assigns the trace request id, so a schedule a refused probe made could not be found and removed',
  programExecutor:
    'skipped: the server assigns the trace request id, so a schedule a refused probe made could not be found and removed',
  featureToggle:
    'skipped: creating a feature toggle was refused on the system adt-clients measured (403, MIGRATION-36)',
  appendStructure: fixture(
    'append structure (it appends to a structure the probe would have to own and activate first)',
  ),
  authorizationField: fixture('authorization field'),
  behaviorDefinition: fixture(
    'behavior definition (it needs a RAP root view entity)',
  ),
  behaviorImplementation: fixture(
    'behavior implementation (it needs a behavior definition and its pool class)',
  ),
  enhancement: fixture('enhancement (it needs an enhancement spot)'),
  functionInclude: fixture('function include'),
  package: fixture(
    'package (it needs a software component and a transport layer of the system)',
  ),
  scalarFunction: fixture('CDS scalar function'),
  scalarFunctionImplementation: fixture(
    'CDS scalar function implementation (it needs a scalar function)',
  ),
  serviceBinding: fixture(
    'service binding (its activation publishes a service)',
  ),
};

/** The reason an operation the cycle has no step for is skipped. */
export function skipReason(objectType: string): string | undefined {
  return SKIP_REASONS[objectType];
}
