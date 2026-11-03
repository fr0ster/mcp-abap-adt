/**
 * Every read a served tool sends states which version it reads (the owner,
 * 2026-11-01): ADT answers a read without a version from the working area —
 * the inactive document where one exists — and adt-clients 40 sends exactly
 * the version it is given and none when none is given. So no read of the
 * server may reach ADT without one.
 *
 * The server's client contract (`adtClientContract.ts`) requires the version
 * on every read member, so a read without one does not compile. This suite is
 * the net under it: every served tool (`servedTools`: the full set's readonly,
 * search, system, run and high groups, and both compact halves) runs over a
 * counting connection with real adt-clients code — once per sample call of
 * the batch proof (`batchEntryCases.ts`), and once more with a sample of its
 * own (`SAMPLES`, else its schema's required arguments) — and every GET it
 * sends to an object's own address must carry `version` (in the query, or as
 * a request parameter) with one of the three values ADT takes.
 *
 * A tool that declares the shared read version (`READ_VERSION_PROPERTY`)
 * passes the value it is given to every read it sends: each of its sample
 * calls, given each of the three values, sends reads that carry exactly it.
 */

import { COMPACT_READ_TAKES } from '../../../lib/compact/compactSchemas';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type {
  HandlerContext,
  HandlerEntry,
  ToolDefinition,
} from '../../../lib/handlers/interfaces';
import {
  READ_VERSION_PROPERTY,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import { callInItsForm } from '../../../lib/handlers/utils/handlerCall';
import {
  resetSystemContextCache,
  setSystemContext,
} from '../../../lib/systemContext';
import { BATCH_ENTRY_CASES } from '../../helpers/batchEntryCases';
import {
  type CountedRequest,
  countingConnection,
  servedTools,
} from '../../helpers/batchHarness';
import { silentLogger } from '../../helpers/lowToCompact';

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const VERSIONS: ReadonlyArray<ReadVersion> = [
  'active',
  'inactive',
  'workingArea',
];

/**
 * The ADT addresses of objects: a GET under one of them reads an object (its
 * document or its source), and takes a version.
 */
const OBJECT_ROOTS = [
  '/sap/bc/adt/oo/classes/',
  '/sap/bc/adt/oo/interfaces/',
  '/sap/bc/adt/programs/programs/',
  '/sap/bc/adt/programs/includes/',
  '/sap/bc/adt/functions/groups/',
  '/sap/bc/adt/ddic/',
  '/sap/bc/adt/bo/behaviordefinitions/',
  '/sap/bc/adt/businessservices/bindings/',
  '/sap/bc/adt/messageclass/',
  '/sap/bc/adt/packages/',
  '/sap/bc/adt/enhancements/',
  '/sap/bc/adt/acm/dcl/sources/',
];

/**
 * Addresses under an object that are no read of the object: its version
 * list and a listed version (addressed by its own URI), the enhancement
 * elements and options of a host, the binding types.
 */
const NOT_A_READ = [
  '/versions',
  '/enhancements/elements',
  '/enhancements/options',
  '/bindings/bindingtypes',
  // An include's main programs: the programs that include it, a listing of
  // references with no version of the include's own.
  '/mainprograms',
  // The stored ATC results: check results, not an object's source.
  '/atc/results',
];

/**
 * The served tools that read no object's document or source, each with why:
 * the guard requires every other tool to send at least one object read in
 * its samples, so a tool that stops reading, or a sample that stops reaching
 * its read, turns this red.
 */
const NO_OBJECT_READ: Readonly<Record<string, string>> = {
  ActivateBehaviorDefinition: 'activates',
  ActivateClass: 'activates',
  ActivateDataElement: 'activates',
  ActivateDdl: 'activates',
  ActivateDomain: 'activates',
  ActivateFunctionGroup: 'activates',
  ActivateFunctionModule: 'activates',
  ActivateInclude: 'activates',
  ActivateInterface: 'activates',
  ActivateMetadataExtension: 'activates',
  ActivateObjects: 'activates',
  ActivateProgram: 'activates',
  ActivateServiceBinding: 'activates',
  ActivateServiceDefinition: 'activates',
  ActivateStructure: 'activates',
  ActivateTable: 'activates',
  ActivateTableType: 'activates',
  GetMainPrograms: "lists an include's main programs (no version to state)",
  ListATCResults: 'lists the stored ATC results',
  AddTransportObject: 'works on transport requests',
  CheckBehaviorDefinition: 'runs a syntax check',
  CheckClass: 'runs a syntax check',
  CheckDataElement: 'runs a syntax check',
  CheckDdl: 'runs a syntax check',
  CheckDomain: 'runs a syntax check',
  CheckFunctionGroup: 'runs a syntax check',
  CheckFunctionModule: 'runs a syntax check',
  CheckInterface: 'runs a syntax check',
  CheckMetadataExtension: 'runs a syntax check',
  CheckPackage: 'runs a syntax check',
  CheckProgram: 'runs a syntax check',
  CheckStructure: 'runs a syntax check',
  CheckTable: 'runs a syntax check',
  CheckTableType: 'runs a syntax check',
  CreateBehaviorImplementation: 'creates',
  CreateCdsUnitTest: 'creates',
  CreateClass: 'creates',
  CreateDdl: 'creates',
  CreateFunctionGroup:
    "reads its group back only after SAP's interface-not-created refusal (functionGroupHigh.test.ts)",
  CreateFunctionGroupUnitTest: 'creates',
  CreateFunctionInclude: 'creates',
  CreateFunctionModule: 'creates',
  CreateInclude: 'creates',
  CreateInterface: 'creates',
  CreateMessageClass: 'creates',
  CreatePackage: 'creates',
  CreateProgram: 'creates',
  CreateServiceBinding: 'creates',
  CreateServiceDefinition: 'creates',
  CreateStructure: 'creates',
  CreateTable: 'creates',
  CreateTransport: 'works on transport requests',
  CreateTransportTask: 'works on transport requests',
  CreateUnitTest: 'creates',
  DeleteBehaviorDefinition: 'deletes',
  DeleteBehaviorImplementation: 'deletes',
  DeleteCdsUnitTest: 'deletes',
  DeleteClass: 'deletes',
  DeleteDataElement: 'deletes',
  DeleteDdl: 'deletes',
  DeleteDomain: 'deletes',
  DeleteFunctionGroup: 'deletes',
  DeleteFunctionInclude: 'deletes',
  DeleteFunctionModule: 'deletes',
  DeleteInclude: 'deletes',
  DeleteInterface: 'deletes',
  DeleteLocalDefinitions: 'deletes',
  DeleteLocalMacros: 'deletes',
  DeleteLocalTestClass: 'deletes',
  DeleteLocalTypes: 'deletes',
  DeleteMessageClass: 'deletes',
  DeleteMetadataExtension: 'deletes',
  DeletePackage: 'deletes',
  DeleteProgram: 'deletes',
  DeleteServiceBinding: 'deletes',
  DeleteServiceDefinition: 'deletes',
  DeleteStructure: 'deletes',
  DeleteTable: 'deletes',
  DeleteTableType: 'deletes',
  DeleteUnitTest: 'deletes',
  DescribeByList: 'describes objects from repository searches',
  GetAbapAST: 'parses the code it is given; sends nothing',
  GetAbapSemanticAnalysis: 'analyses the code it is given; sends nothing',
  GetAbapSystemSymbols: 'resolves symbols by repository search',
  GetAdtTypes: 'lists the object types',
  GetATCFindings: 'runs ATC or reads its findings',
  GetATCResult: 'reads a stored ATC result',
  GetATCRunStatus: 'runs ATC or reads its findings',
  GetBehaviorDefinitionVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetBehaviorDefinitionVersions:
    'reads the version list, or a listed version by its own address',
  GetBehaviorDefinitionVersionSource:
    'reads the version list, or a listed version by its own address',
  GetClassVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetClassVersions:
    'reads the version list, or a listed version by its own address',
  GetClassVersionSource:
    'reads the version list, or a listed version by its own address',
  GetDdlVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetDdlVersions:
    'reads the version list, or a listed version by its own address',
  GetDdlVersionSource:
    'reads the version list, or a listed version by its own address',
  GetFunctionModuleVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetFunctionModuleVersions:
    'reads the version list, or a listed version by its own address',
  GetFunctionModuleVersionSource:
    'reads the version list, or a listed version by its own address',
  GetInactiveObjects: 'lists the inactive objects',
  GetInterfaceVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetInterfaceVersions:
    'reads the version list, or a listed version by its own address',
  GetInterfaceVersionSource:
    'reads the version list, or a listed version by its own address',
  GetMetadataExtensionVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetMetadataExtensionVersions:
    'reads the version list, or a listed version by its own address',
  GetMetadataExtensionVersionSource:
    'reads the version list, or a listed version by its own address',
  GetObjectInfo:
    "its descriptions are the walks' metadata reads, in envelopes the fake does not answer (batch/metadataReads.test.ts asserts their versions)",
  GetObjectsByType: 'reads node structures',
  GetObjectsList: 'reads node structures',
  GetObjectStructure: 'reads the object structure',
  GetObjectVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetObjectVersions:
    'reads the version list, or a listed version by its own address',
  GetObjectVersionSource:
    'reads the version list, or a listed version by its own address',
  GetPackageContents: 'reads node structures',
  GetProgramVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetProgramVersions:
    'reads the version list, or a listed version by its own address',
  GetProgramVersionSource:
    'reads the version list, or a listed version by its own address',
  GetSqlQuery: 'reads data through the data preview',
  GetStructureVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetStructureVersions:
    'reads the version list, or a listed version by its own address',
  GetStructureVersionSource:
    'reads the version list, or a listed version by its own address',
  GetTableContents: 'reads data through the data preview',
  GetTableTypeVersions:
    'reads the version list, or a listed version by its own address',
  GetTableVersionDiff:
    'reads the version list, or a listed version by its own address',
  GetTableVersions:
    'reads the version list, or a listed version by its own address',
  GetTableVersionSource:
    'reads the version list, or a listed version by its own address',
  GetTransaction: 'reads a transaction through the object properties',
  GetTransport: 'works on transport requests',
  GetUnitTestResult: 'runs ABAP Unit or reads a run',
  GetWhereUsed: 'reads the where-used list',
  HandlerActivate: 'activates',
  HandlerCdsUnitTestResult: 'runs ABAP Unit or reads a run',
  HandlerCdsUnitTestStatus: 'runs ABAP Unit or reads a run',
  HandlerCheckRun: 'runs a syntax check',
  HandlerCreate: 'creates',
  HandlerDelete: 'deletes',
  HandlerDeletionCheck: 'checks a deletion',
  HandlerDumpList: 'reads or runs runtime dumps, traces, feeds or messages',
  HandlerDumpView: 'reads or runs runtime dumps, traces, feeds or messages',
  HandlerGetData: 'reads data through the data preview',
  HandlerLock: 'locks',
  HandlerProfileList: 'reads or runs runtime dumps, traces, feeds or messages',
  HandlerProfileRun: 'reads or runs runtime dumps, traces, feeds or messages',
  HandlerProfileSchedule:
    'reads or runs runtime dumps, traces, feeds or messages',
  HandlerProfileView: 'reads or runs runtime dumps, traces, feeds or messages',
  HandlerSearch: 'searches the repository',
  HandlerServiceBindingListTypes: 'lists the binding types',
  HandlerServiceBindingValidate: 'validates a binding name',
  HandlerTransportCreate: 'works on transport requests',
  HandlerTransportMoveObjects: 'works on transport requests',
  HandlerTransportSortAndCompress: 'works on transport requests',
  HandlerUnitTestResult: 'runs ABAP Unit or reads a run',
  HandlerUnitTestRun: 'runs ABAP Unit or reads a run',
  HandlerUnitTestStatus: 'runs ABAP Unit or reads a run',
  HandlerUnlock: 'unlocks',
  HandlerUpdate: "writes the document it is given under the caller's lock",
  HandlerValidate: 'validates a name',
  HandlerWhereUsed: 'reads the where-used list',
  ListServiceBindingTypes: 'lists the binding types',
  ListTransports: 'works on transport requests',
  MoveTransportObjects: 'works on transport requests',
  ReadTransportActionLog: 'works on transport requests',
  ReadTransportObjects: 'works on transport requests',
  RemoveTransportObject: 'works on transport requests',
  RunAbapUnit: 'runs ABAP Unit or reads a run',
  RunATC: 'runs ATC or reads its findings',
  RunCdsUnitTest: 'runs ABAP Unit or reads a run',
  RunFunctionGroupUnitTest: 'runs ABAP Unit or reads a run',
  RunFunctionModuleUnitTest: 'runs ABAP Unit or reads a run',
  RunProgramUnitTest: 'runs ABAP Unit or reads a run',
  RuntimeAnalyzeProfilerTrace:
    'reads or runs runtime dumps, traces, feeds or messages',
  RuntimeCreateProfilerTraceParameters:
    'reads or runs runtime dumps, traces, feeds or messages',
  RuntimeGetDumpById: 'reads or runs runtime dumps, traces, feeds or messages',
  RuntimeGetGatewayErrorLog:
    'reads or runs runtime dumps, traces, feeds or messages',
  RuntimeGetProfilerTraceData:
    'reads or runs runtime dumps, traces, feeds or messages',
  RuntimeListFeeds: 'reads or runs runtime dumps, traces, feeds or messages',
  RuntimeListProfilerTraceFiles:
    'reads or runs runtime dumps, traces, feeds or messages',
  RuntimeListSystemMessages:
    'reads or runs runtime dumps, traces, feeds or messages',
  RuntimeRunClass: 'runs a class',
  RuntimeRunProgram: 'runs a program',
  RunUnitTest: 'runs ABAP Unit or reads a run',
  SearchObject: 'searches the repository',
  SearchSource:
    'its source reads follow a package walk the fake does not answer (searchSourceVersions.test.ts asserts them)',
  SortAndCompressTransportTask: 'works on transport requests',
  UpdateBehaviorImplementation: 'writes the source it is given under a lock',
  UpdateCdsUnitTest: 'writes the source it is given under a lock',
  UpdateClass: 'writes the source it is given under a lock',
  UpdateDdl: 'writes the source it is given under a lock',
  UpdateFunctionGroupUnitTest: 'writes the source it is given under a lock',
  UpdateFunctionInclude: 'writes the source it is given under a lock',
  UpdateInclude: 'writes the source it is given under a lock',
  UpdateIncludeMetadata: 'writes the metadata document it is given',
  UpdateInterface: 'writes the source it is given under a lock',
  UpdateLocalDefinitions: 'writes the source it is given under a lock',
  UpdateLocalMacros: 'writes the source it is given under a lock',
  UpdateLocalTestClass: 'writes the source it is given under a lock',
  UpdateLocalTypes: 'writes the source it is given under a lock',
  UpdateProgram: 'writes the source it is given under a lock',
  UpdateProgramUnitTest: 'writes the source it is given under a lock',
  UpdateServiceBinding: 'publishes or unpublishes the binding',
  UpdateStructure: 'writes the source it is given under a lock',
  UpdateTable: 'writes the source it is given under a lock',
  UpdateUnitTest: 'writes the source it is given under a lock',
  ValidateServiceBinding: 'validates a binding name',
};

/**
 * One sample call: its arguments, the body every answer carries where the
 * call needs a document of its own shape to reach its read, and what the
 * process holds before the call (a cache a tool reads from).
 */
interface Sample {
  args: Record<string, unknown>;
  body?: string | undefined;
  prepare?: () => void;
}

/** Sample calls for tools whose required arguments alone end before a read. */
const SAMPLES: Readonly<Record<string, Sample>> = {
  CreateDomain: { args: { domain_name: 'DOM_A', package_name: 'PKG_A' } },
  DescribeByList: { args: { objects: [{ name: 'CLAS_A', type: 'CLAS/OC' }] } },
  GetIncludesList: { args: { object_name: 'PROG_A', object_type: 'PROG/P' } },
  GetObjectInfo: { args: { parent_type: 'DEVC/K', parent_name: 'PKG_A' } },
  GetObjectsList: { args: { parent_type: 'DEVC/K', parent_name: 'PKG_A' } },
  GetPackageContents: { args: { package_name: 'PKG_A' } },
  GetPackageTree: {
    args: { package_name: 'PKG_A', include_descriptions: true },
  },
  GetStructuresList: { args: { structure_name: 'STRU_A' } },
  SearchSource: { args: { query: 'X', packages: ['PKG_A'] } },
  // A type it is not told: it probes each kind's metadata.
  GetEnhancements: { args: { object_name: 'OBJ_A', object_type: 'unknown' } },
  // A source code plugin: its source.
  GetEnhancementImpl: {
    args: { enhancement_spot: 'enhoxhh', enhancement_name: 'ENHO_A' },
  },
  // A cached node with an address: its document.
  GetObjectNodeFromCache: {
    args: { object_type: 'PROG/P', object_name: 'PROG_A', tech_name: 'PROG_A' },
    prepare: () =>
      objectsListCache.setCache({
        objects: [
          {
            OBJECT_TYPE: 'PROG/P',
            OBJECT_NAME: 'PROG_A',
            TECH_NAME: 'PROG_A',
            OBJECT_URI: '/sap/bc/adt/programs/programs/prog_a',
          },
        ],
      }),
  },
};

/** A JSON-schema property's sample value: its first member, else one of its type. */
function sampleOf(property: ToolDefinition['inputSchema']): unknown {
  if (Array.isArray(property?.enum)) return property.enum[0];
  switch (property?.type) {
    case 'boolean':
      return false;
    case 'number':
    case 'integer':
      return 1;
    case 'array':
      return [sampleOf(property.items)];
    case 'object':
      return requiredOf(property);
    default:
      return 'OBJ_A';
  }
}

/** A JSON object schema's required arguments, each with a sample value. */
function requiredOf(
  schema: ToolDefinition['inputSchema'],
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (schema?.type !== 'object') return args;
  for (const name of schema.required ?? []) {
    args[name] = sampleOf(schema.properties?.[name]);
  }
  return args;
}

/** The path of a request's address, without its query. */
const pathOf = (url: string): string => url.split('?')[0] ?? url;

/** A request is an object read: a GET under an object, and no listing beside it. */
function isObjectRead(request: CountedRequest): boolean {
  if (request.method !== 'GET') return false;
  const path = pathOf(request.url).toLowerCase();
  return (
    OBJECT_ROOTS.some((root) => path.startsWith(root)) &&
    !NOT_A_READ.some((marker) => path.includes(marker))
  );
}

/** The versions a request states: in its query, and as a request parameter. */
function versionsOf(request: CountedRequest): string[] {
  const stated = new URL(
    request.url,
    'https://example.com',
  ).searchParams.getAll('version');
  const { params } = request;
  if (typeof params === 'object' && params !== null && 'version' in params) {
    stated.push(String(params.version));
  }
  return stated;
}

/**
 * A request as sent, with the requests an ADT batch envelope carries in its
 * body: each part's request line (`GET <address> HTTP/1.1`).
 */
function unpacked(request: CountedRequest): CountedRequest[] {
  const { data } = request;
  if (!pathOf(request.url).endsWith('/communication/batch')) return [request];
  if (typeof data !== 'string') return [request];
  return data
    .split('\n')
    .map((line) => line.trim().split(' '))
    .filter(
      (words) =>
        words.length === 3 &&
        words[2]?.startsWith('HTTP/') === true &&
        words[1]?.startsWith('/') === true,
    )
    .map((words) => ({
      method: words[0] ?? '',
      url: words[1] ?? '',
      params: undefined,
      data: undefined,
    }));
}

/** What one call sent, as object reads with the versions each states. */
async function readsOf(
  tool: string,
  sample: Sample,
): Promise<Array<{ read: string; versions: string[] }>> {
  sample.prepare?.();
  const counting = countingConnection('document', sample.body);
  const context: HandlerContext = {
    connection: counting.connection,
    logger: silentLogger,
  };
  const entry = servedTools(context).get(tool);
  if (entry === undefined) throw new Error(`no served tool ${tool}`);
  try {
    await callInItsForm(
      entry.handler,
      context,
      structuredClone(sample.args),
      (_c, f) => f(),
    );
  } catch {
    // What it sent before the throw is what is checked.
  }
  return counting.requests
    .flatMap(unpacked)
    .filter(isObjectRead)
    .map((request) => ({
      read: `${request.method} ${request.url}`,
      versions: versionsOf(request),
    }));
}

/** The served tools, by name. */
function served(): Map<string, HandlerEntry> {
  const counting = countingConnection('document', undefined);
  return servedTools({ connection: counting.connection, logger: silentLogger });
}

/** Every sample call of `tool`: the batch proof's, and its own. */
function callsOf(tool: string, entry: HandlerEntry): Sample[] {
  const own = SAMPLES[tool] ?? {
    args: requiredOf(entry.toolDefinition.inputSchema),
  };
  return [
    ...BATCH_ENTRY_CASES.filter((c) => c.tool === tool).map(
      (c): Sample => ({ args: c.args, body: c.body }),
    ),
    own,
  ];
}

/**
 * Whether a tool declares the shared read version — with the schema default
 * or without (`READ_VERSION_PROPERTY_UNDEFAULTED`), the same three values.
 */
function declaresReadVersion(entry: HandlerEntry): boolean {
  const version = entry.toolDefinition.inputSchema?.properties?.version;
  return version?.enum === READ_VERSION_PROPERTY.enum;
}

/** Whether a call of `tool` with `args` reads at the version it is given. */
function takesVersion(entry: HandlerEntry, args: Record<string, unknown>) {
  if (!declaresReadVersion(entry)) return false;
  if (entry.toolDefinition.name !== 'HandlerGet') return true;
  const member = args.object_type;
  const takes: Readonly<Record<string, readonly string[]>> =
    COMPACT_READ_TAKES.members;
  return (
    typeof member === 'string' &&
    (takes[member] ?? []).includes('version') &&
    args.part !== 'run' &&
    args.part !== 'object_structure' &&
    args.part !== 'node_structure'
  );
}

describe('every read a served tool sends states its version', () => {
  beforeEach(() => {
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => resetSystemContextCache());

  const tools = served();

  it.each([...tools.keys()].sort())(
    '%s: every object read it sends names active, inactive or workingArea',
    async (tool) => {
      const entry = tools.get(tool);
      if (entry === undefined) throw new Error(`no served tool ${tool}`);
      const unstated: string[] = [];
      let reads = 0;
      for (const sample of callsOf(tool, entry)) {
        for (const { read, versions } of await readsOf(tool, sample)) {
          reads += 1;
          const named =
            versions.length === 1 &&
            VERSIONS.some((version) => version === versions[0]);
          if (!named) unstated.push(`${read} ${JSON.stringify(versions)}`);
        }
      }
      // A tool reads an object in its samples, or says why it reads none.
      expect({ tool, reads: reads > 0 }).toEqual({
        tool,
        reads: NO_OBJECT_READ[tool] === undefined,
      });
      expect(unstated).toEqual([]);
    },
  );

  const versioned = [...tools.entries()]
    .flatMap(([tool, entry]) =>
      callsOf(tool, entry)
        .filter((sample) => takesVersion(entry, sample.args))
        .map((sample): [string, string, Sample] => [
          `${tool} ${JSON.stringify(sample.args)}`,
          tool,
          sample,
        ]),
    )
    .sort(([a], [b]) => a.localeCompare(b));

  it('each tool that declares the read version has a sample call that reads', () => {
    const declaring = [...tools.entries()]
      .filter(([, entry]) => declaresReadVersion(entry))
      .map(([tool]) => tool)
      .sort();
    const sampled = [...new Set(versioned.map(([, tool]) => tool))].sort();
    expect(sampled).toEqual(declaring);
  });

  describe.each(versioned)('%s', (_name, tool, sample) => {
    it.each(VERSIONS)('given %s, every read it sends states it', async (v) => {
      const reads = await readsOf(tool, {
        ...sample,
        args: { ...sample.args, version: v },
      });
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.filter(({ versions }) => versions.join() !== v)).toEqual([]);
    });
  });
});
