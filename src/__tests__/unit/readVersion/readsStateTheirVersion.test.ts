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
];

/**
 * Tools whose write member in adt-clients 40 reads the object itself before
 * it writes: a message class message's create, update and delete read the
 * message class with no version (`AdtMessageClassMessage`). That read is the
 * library's, and its version is not the server's to name; each of these sends
 * exactly that one unversioned read, so a library that names it turns this
 * red.
 */
const LIBRARY_READS: Readonly<Record<string, string>> = {
  CreateMessageClassMessage: 'GET /sap/bc/adt/messageclass/',
  UpdateMessageClassMessage: 'GET /sap/bc/adt/messageclass/',
  DeleteMessageClassMessage: 'GET /sap/bc/adt/messageclass/',
};

/** Sample calls for tools whose required arguments alone end before a read. */
const SAMPLES: Readonly<Record<string, Record<string, unknown>>> = {
  CreateDomain: { domain_name: 'DOM_A', package_name: 'PKG_A' },
  DescribeByList: { objects: [{ name: 'CLAS_A', type: 'CLAS/OC' }] },
  GetIncludesList: { object_name: 'PROG_A', object_type: 'PROG/P' },
  GetObjectInfo: { parent_type: 'DEVC/K', parent_name: 'PKG_A' },
  GetObjectsList: { parent_type: 'DEVC/K', parent_name: 'PKG_A' },
  GetPackageContents: { package_name: 'PKG_A' },
  GetPackageTree: { package_name: 'PKG_A', include_descriptions: true },
  GetStructuresList: { structure_name: 'STRU_A' },
  SearchSource: { query: 'X', packages: ['PKG_A'] },
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
  args: Record<string, unknown>,
): Promise<Array<{ read: string; versions: string[] }>> {
  const counting = countingConnection('document', undefined);
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
      structuredClone(args),
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
function callsOf(
  tool: string,
  entry: HandlerEntry,
): Array<Record<string, unknown>> {
  const own = SAMPLES[tool] ?? requiredOf(entry.toolDefinition.inputSchema);
  return [
    ...BATCH_ENTRY_CASES.filter((c) => c.tool === tool).map((c) => c.args),
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
      for (const args of callsOf(tool, entry)) {
        for (const { read, versions } of await readsOf(tool, args)) {
          const named =
            versions.length === 1 &&
            VERSIONS.some((version) => version === versions[0]);
          if (!named) unstated.push(`${read} ${JSON.stringify(versions)}`);
        }
      }
      const library = LIBRARY_READS[tool];
      if (library === undefined) {
        expect(unstated).toEqual([]);
        return;
      }
      expect(unstated.length).toBeGreaterThan(0);
      expect(unstated.filter((read) => !read.startsWith(library))).toEqual([]);
    },
  );

  const versioned = [...tools.entries()]
    .flatMap(([tool, entry]) =>
      callsOf(tool, entry)
        .filter((args) => takesVersion(entry, args))
        .map((args): [string, string, Record<string, unknown>] => [
          `${tool} ${JSON.stringify(args)}`,
          tool,
          args,
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

  describe.each(versioned)('%s', (_name, tool, args) => {
    it.each(VERSIONS)('given %s, every read it sends states it', async (v) => {
      const reads = await readsOf(tool, { ...args, version: v });
      expect(reads.length).toBeGreaterThan(0);
      expect(reads.filter(({ versions }) => versions.join() !== v)).toEqual([]);
    });
  });
});
