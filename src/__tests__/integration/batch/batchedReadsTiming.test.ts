/**
 * The internally batched reads timed against their sequential path (spec §11,
 * plan Task 31), on the configured system.
 *
 * Where it runs: the SAP system the test config names, on premise or ABAP
 * Cloud (tests/test-config.yaml, or the file `MCP_TEST_CONFIG` names — one per
 * transport: `connection_type: http` or `rfc`); without a configuration,
 * connection or session every case skips, saying why. It only reads: the config's `environment.default_package` ("the
 * package") and, when the config names one, `shared_dependencies.super_package`
 * ("a larger package"), through the real handlers and the real
 * `AdtBatchConnection`.
 *
 * Per tool and package:
 * - one untimed sequential read (a port already marked not served, which sends
 *   no envelope) — the reference answer;
 * - three repetitions of the sequential and the batched read (a fresh port,
 *   which learns the destination's verdict from its first envelope), their
 *   order alternating per repetition;
 * - every answer equals the reference (compared after the timing is written),
 *   the sequential reads send no envelope, and the batched reads send at
 *   least one;
 * - recorded per read: wall time, the requests sent (round trips: envelopes
 *   included), the envelopes, and the requests inside them (parts). The median
 *   of the three is written to stderr, one `batch-timing` line per path.
 *
 * Tools of Tasks 23 and 24, per package: GetPackageContents, GetPackageTree,
 * GetObjectsList, GetObjectInfo, compact HandlerGet part `contents`,
 * SearchSource. Tools of Tasks 25–27, on the config's shared objects
 * (`shared_dependencies`, those served on the system): GetIncludesList (two
 * function groups), GetStructuresList (two structures), GetEnhancements (two
 * classes), ListTransports (modifiable), DescribeByList (a class, a table and
 * a structure), GetAbapSystemSymbols (a source naming a shared class and
 * interface), GetWhereUsed (two
 * tables), RuntimeListFeeds (dumps and system messages of a fixed past day).
 *
 * Run (HTTP): npm test -- --testPathPatterns='batchedReadsTiming' --testPathIgnorePatterns='__tests__/admin/' --runInBand --forceExit
 * Run (RFC):  MCP_TEST_CONFIG=tests/test-config.rfc.yaml with the same command,
 *             the RFC SDK's libraries on LD_LIBRARY_PATH.
 */

import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleHandlerGet } from '../../../../compact-readonly-entries/src/handlers/handleHandlerGet';
import { handleGetEnhancements } from '../../../handlers/enhancement/readonly/handleGetEnhancements';
import { handleGetIncludesList } from '../../../handlers/include/readonly/handleGetIncludesList';
import type { HandlerContext } from '../../../handlers/interfaces';
import { handleGetPackageContents } from '../../../handlers/package/readonly/handleGetPackageContents';
import { handleGetObjectsList } from '../../../handlers/search/readonly/handleGetObjectsList';
import { handleGetStructuresList } from '../../../handlers/structure/readonly/handleGetStructuresList';
import { handleGetPackageTree } from '../../../handlers/system/high/handleGetPackageTree';
import { handleDescribeByList } from '../../../handlers/system/readonly/handleDescribeByList';
import { handleGetAbapSystemSymbols } from '../../../handlers/system/readonly/handleGetAbapSystemSymbols';
import { handleGetObjectInfo } from '../../../handlers/system/readonly/handleGetObjectInfo';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import { handleRuntimeListFeeds } from '../../../handlers/system/readonly/handleRuntimeListFeeds';
import { handleSearchSource } from '../../../handlers/system/readonly/handleSearchSource';
import { handleListTransports } from '../../../handlers/transport/readonly/handleListTransports';
import {
  type BatchAvailability,
  createBatchAvailability,
} from '../../../lib/batch/availability';
import { isRfcConnection } from '../../../lib/connectionKind';
import {
  getSharedDependenciesConfig,
  getSystemType,
  getTimeout,
  isTestAvailableForSystem,
  loadTestConfig,
  resolvePackageName,
} from '../helpers/configHelpers';
import { createTestLogger } from '../helpers/loggerHelpers';
import { createTestConnectionAndSession } from '../helpers/sessionHelpers';

const testLogger = createTestLogger('batched-reads-timing');

const ENVELOPE_URL = '/sap/bc/adt/communication/batch';
const PART_MARK = 'Content-Type: application/http';
const REPETITIONS = 3;

type Recorded = { url: string; parts: number };

/**
 * `connection` with every request recorded: its URL and, for an envelope, the
 * requests it carries. Writes the handler's client makes to the view stay on
 * the view, never on the connection under it.
 */
function recording(connection: IAbapConnection): {
  view: IAbapConnection;
  sent: Recorded[];
} {
  const sent: Recorded[] = [];
  const own = new Map<PropertyKey, unknown>();
  const record = (request: { url: string; data?: unknown }) => {
    const body = typeof request.data === 'string' ? request.data : '';
    sent.push({
      url: request.url,
      parts: request.url.startsWith(ENVELOPE_URL)
        ? body.split(PART_MARK).length - 1
        : 0,
    });
    return connection.makeAdtRequest(request as never);
  };
  const view = new Proxy(connection as object, {
    get(target, property) {
      if (own.has(property)) return own.get(property);
      if (property === 'makeAdtRequest') return record;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(_target, property, value) {
      own.set(property, value);
      return true;
    },
  }) as IAbapConnection;
  return { view, sent };
}

/** A port whose destination is already known not to be served. */
function notServed(): BatchAvailability {
  const port = createBatchAvailability();
  port.noteOuterStatus(404);
  return port;
}

type Path = 'sequential' | 'batched';

type Measure = {
  ms: number;
  requests: number;
  envelopes: number;
  parts: number;
};

async function measured(
  connection: IAbapConnection,
  path: Path,
  read: (context: HandlerContext) => Promise<unknown>,
): Promise<{ answer: unknown; measure: Measure }> {
  const { view, sent } = recording(connection);
  const context: HandlerContext = {
    connection: view,
    batchAvailability:
      path === 'sequential' ? notServed() : createBatchAvailability(),
  };
  const started = process.hrtime.bigint();
  const answer = await read(context);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const envelopes = sent.filter((r) => r.url.startsWith(ENVELOPE_URL));
  return {
    answer,
    measure: {
      ms,
      requests: sent.length,
      envelopes: envelopes.length,
      parts: envelopes.reduce((sum, r) => sum + r.parts, 0),
    },
  };
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
};

const isError = (answer: unknown): boolean =>
  (answer as { isError?: boolean } | null)?.isError === true;

type Case = {
  tool: string;
  read: (name: string) => (context: HandlerContext) => Promise<unknown>;
};

const CASES: Case[] = [
  {
    tool: 'GetPackageContents',
    read: (name) => (context) =>
      handleGetPackageContents(context, {
        package_name: name,
        include_subpackages: true,
      }),
  },
  {
    tool: 'GetPackageTree',
    read: (name) => (context) =>
      handleGetPackageTree(context, { package_name: name }),
  },
  {
    tool: 'GetObjectsList',
    read: (name) => (context) =>
      handleGetObjectsList(context, {
        parent_type: 'DEVC/K',
        parent_name: name,
        parent_tech_name: name,
      }),
  },
  {
    tool: 'GetObjectInfo',
    read: (name) => (context) =>
      handleGetObjectInfo(context, {
        parent_type: 'DEVC/K',
        parent_name: name,
        maxDepth: 5,
      }),
  },
  {
    tool: 'HandlerGet contents',
    read: (name) => (context) =>
      handleHandlerGet(context, {
        object_type: 'PACKAGE',
        part: 'contents',
        package_name: name,
      }),
  },
  {
    tool: 'SearchSource',
    read: (name) => (context) =>
      handleSearchSource(context, {
        query: 'DATA',
        packages: [name],
      }),
  },
];

/** The packages read: the config's default one, and a larger one if named. */
function packagesRead(): Array<{ label: string; name: string }> {
  let larger = '';
  try {
    const raw = loadTestConfig()?.shared_dependencies?.super_package;
    larger = typeof raw === 'string' ? raw.trim() : '';
  } catch {
    larger = '';
  }
  const listed = [{ label: 'the package', name: resolvePackageName() }];
  if (larger !== '') listed.push({ label: 'a larger package', name: larger });
  return listed;
}

/** The shared objects of one kind served on the configured system, by name. */
function sharedNames(kind: string): string[] {
  const listed: unknown = getSharedDependenciesConfig()?.[kind];
  if (!Array.isArray(listed)) return [];
  const names: string[] = [];
  for (const item of listed) {
    if (typeof item !== 'object' || item === null) continue;
    const name: unknown = Reflect.get(item, 'name');
    if (
      typeof name === 'string' &&
      isTestAvailableForSystem(Reflect.get(item, 'available_in'))
    ) {
      names.push(name);
    }
  }
  return names;
}

type Read = (context: HandlerContext) => Promise<unknown>;

/** A tool of Tasks 25–27 on the shared objects: its read, or why there is none here. */
type SharedCase = { tool: string; prepare: () => Read | string };

/** Two names of `kind`, or why there are not two. */
function two(kind: string): string[] | string {
  const names = sharedNames(kind).slice(0, 2);
  return names.length === 2
    ? names
    : `the config names fewer than two shared ${kind} served here`;
}

const SHARED_CASES: SharedCase[] = [
  {
    tool: 'GetIncludesList',
    prepare: () => {
      const groups = two('function_groups');
      if (typeof groups === 'string') return groups;
      return (context) =>
        handleGetIncludesList(context, {
          objects: groups.map((name) => ({
            object_name: name,
            object_type: 'FUGR/F',
          })),
        });
    },
  },
  {
    tool: 'GetStructuresList',
    prepare: () => {
      const structures = two('structures');
      if (typeof structures === 'string') return structures;
      return (context) =>
        handleGetStructuresList(context, { structure_names: structures });
    },
  },
  {
    tool: 'GetEnhancements',
    prepare: () => {
      const classes = two('classes');
      if (typeof classes === 'string') return classes;
      return (context) =>
        handleGetEnhancements(context, {
          objects: classes.map((name) => ({
            object_name: name,
            object_type: 'CLAS/OC',
          })),
        });
    },
  },
  {
    tool: 'ListTransports',
    prepare: () => (context) =>
      handleListTransports(context, { modifiable_only: true }),
  },
  {
    tool: 'DescribeByList',
    prepare: () => {
      const [cls] = sharedNames('classes');
      const [table] = sharedNames('tables');
      const [structure] = sharedNames('structures');
      if (!cls || !table || !structure) {
        return 'the config names no shared class, table or structure served here';
      }
      return (context) =>
        handleDescribeByList(context, {
          objects: [
            { name: cls, type: 'CLAS/OC' },
            { name: table, type: 'TABL/DT' },
            { name: structure },
          ],
        });
    },
  },
  {
    tool: 'GetAbapSystemSymbols',
    prepare: () => {
      // A class and an interface: the symbols the tool reads one request each.
      const [cls] = sharedNames('classes');
      const [intf] = sharedNames('interfaces');
      if (!cls || !intf) {
        return 'the config names no shared class or interface served here';
      }
      return (context) =>
        handleGetAbapSystemSymbols(context, {
          // The handler reads a class or an interface it finds defined in the
          // source: one definition of each, named after the shared objects.
          code: `CLASS ${cls.toLowerCase()} DEFINITION.\nENDCLASS.\nINTERFACE ${intf.toLowerCase()}.\nENDINTERFACE.`,
        });
    },
  },
  {
    tool: 'GetWhereUsed',
    prepare: () => {
      const tables = two('tables');
      if (typeof tables === 'string') return tables;
      return (context) =>
        handleGetWhereUsed(context, {
          objects: tables.map((name) => ({
            object_name: name,
            object_type: 'TABL/DT',
          })),
        });
    },
  },
  {
    tool: 'RuntimeListFeeds',
    prepare: () => (context) =>
      handleRuntimeListFeeds(context, {
        feed_types: ['dumps', 'system_messages'],
        from: '20261001000000',
        to: '20261002000000',
        max_results: 20,
      }),
  },
];

/** The connection's own kind, not the config's word for it. */
const transport = (connection: IAbapConnection): string =>
  isRfcConnection(connection) ? 'rfc' : 'http';

/**
 * One read timed on both paths: an untimed sequential reference, then
 * REPETITIONS of each path in alternating order, the `batch-timing` lines
 * written, and every answer compared with the reference.
 */
async function timeBothPaths(
  connection: IAbapConnection,
  tool: string,
  scope: string,
  read: (context: HandlerContext) => Promise<unknown>,
): Promise<void> {
  const reference = await measured(connection, 'sequential', read);
  expect(isError(reference.answer)).toBe(false);
  expect(reference.measure.envelopes).toBe(0);

  const runs: Record<Path, Measure[]> = { sequential: [], batched: [] };
  // Compared once every repetition is timed, so a differing answer
  // still leaves its timing on record.
  const answers: Array<{ path: Path; answer: unknown }> = [];
  for (let rep = 0; rep < REPETITIONS; rep++) {
    const order: Path[] =
      rep % 2 === 0 ? ['sequential', 'batched'] : ['batched', 'sequential'];
    for (const path of order) {
      const { answer, measure } = await measured(connection, path, read);
      answers.push({ path, answer });
      if (path === 'sequential') expect(measure.envelopes).toBe(0);
      else expect(measure.envelopes).toBeGreaterThan(0);
      runs[path].push(measure);
    }
  }

  for (const path of ['sequential', 'batched'] as Path[]) {
    const all = runs[path];
    const line = [
      'batch-timing',
      transport(connection),
      tool,
      scope,
      path,
      `median_ms=${median(all.map((m) => m.ms)).toFixed(0)}`,
      `ms=${all.map((m) => m.ms.toFixed(0)).join('/')}`,
      `requests=${median(all.map((m) => m.requests))}`,
      `envelopes=${median(all.map((m) => m.envelopes))}`,
      `parts=${median(all.map((m) => m.parts))}`,
    ].join('\t');
    process.stderr.write(`${line}\n`);
  }

  for (const { answer } of answers) {
    expect(answer).toEqual(reference.answer);
  }
}

describe('batched reads timed against the sequential path on the system the test config names', () => {
  let connection: IAbapConnection | null = null;
  let packages: Array<{ label: string; name: string }> = [];
  // Legacy support is parked: a legacy config skips before any logon.
  const served = getSystemType() !== 'legacy';

  beforeAll(async () => {
    if (!served) return;
    try {
      connection = (await createTestConnectionAndSession()).connection;
      packages = packagesRead();
    } catch (_error) {
      connection = null;
    }
  }, getTimeout('long'));

  for (const tool of CASES) {
    for (const scope of ['the package', 'a larger package']) {
      it(
        `${tool.tool} on ${scope}: the same answer, timed on both paths`,
        async () => {
          if (!served) {
            testLogger?.info(
              '⏭️  Skipping: the test config names a legacy system, which the server does not serve',
            );
            return;
          }
          if (connection === null) {
            testLogger?.info(
              '⏭️  Skipping: runs only on the system the test config names (tests/test-config.yaml or MCP_TEST_CONFIG); no configuration, connection or session here',
            );
            return;
          }
          const target = packages.find((p) => p.label === scope);
          if (target === undefined) {
            testLogger?.info(
              `⏭️  Skipping ${tool.tool} on ${scope}: the config names no shared_dependencies.super_package`,
            );
            return;
          }
          const read = tool.read(target.name);

          await timeBothPaths(connection, tool.tool, scope, read);
        },
        getTimeout('long'),
      );
    }
  }

  for (const shared of SHARED_CASES) {
    it(
      `${shared.tool} on the shared objects: the same answer, timed on both paths`,
      async () => {
        if (!served) {
          testLogger?.info(
            '⏭️  Skipping: the test config names a legacy system, which the server does not serve',
          );
          return;
        }
        if (connection === null) {
          testLogger?.info(
            '⏭️  Skipping: runs only on the system the test config names (tests/test-config.yaml or MCP_TEST_CONFIG); no configuration, connection or session here',
          );
          return;
        }
        const read = shared.prepare();
        if (typeof read === 'string') {
          testLogger?.info(`⏭️  Skipping ${shared.tool}: ${read}`);
          return;
        }
        await timeBothPaths(
          connection,
          shared.tool,
          'the shared objects',
          read,
        );
      },
      getTimeout('long'),
    );
  }
});
