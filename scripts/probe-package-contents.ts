/**
 * Measure the traversal cost of the three walking tools, so the safety bound the
 * result/error-strategies design leaves to stage 1 is a measurement rather than a guess.
 *
 * The design (docs/superpowers/specs/2026-09-08-result-error-strategies-design.md) makes
 * `GetPackageTree`, `GetPackageContents` and `GetObjectsList` bounded traversals that say so
 * in their answer. It deliberately does not fix the bound: "it is a number, not a principle,
 * and belongs with the inventory that shows how large real packages are."
 *
 * This script runs each of them against one real package and reports round trips, the count
 * each tool actually returned, and elapsed time.
 *
 * HOW ROUND TRIPS ARE COUNTED — this is the whole point of the script, so it is worth stating.
 * The counter wraps **`getAxiosInstance()`**, not `makeAdtRequest`. Every HTTP call the
 * connection makes goes through the axios instance
 * (`AbstractAbapConnection.js:284, 359, 381, 393, 479`), including the ones `makeAdtRequest`
 * never sees: `fetchCsrfToken`'s GET and the 403-retry path. Patching `makeAdtRequest` alone
 * under-counts by exactly those.
 *
 * `connection.connect()` is awaited **before** instrumenting, so the one-off discovery/CSRF
 * handshake is not charged to whichever tool happens to run first.
 *
 * WHAT "count" MEANS PER TOOL — three different things, so each row names its own metric:
 *   GetPackageTree               nodes in the returned tree (subpackages and objects alike)
 *   GetPackageContents           entries in the returned flat list
 *   GetObjectsList               `total_objects` as the tool reports it
 * They are not comparable to each other; they are comparable to the same tool on another
 * package, which is what fixing a bound needs.
 *
 * `GetPackageTree` issues one extra request before it walks — the existence pre-check its
 * handler performs (`// Verify package exists before building tree (fixes #38)`). That
 * request is real and is included in its total; the row says so.
 *
 * Nothing is written: all three tools are read-only.
 *
 * Usage:
 *   npx tsx scripts/probe-package-contents.ts --env <file> --package ZMY_PACKAGE
 *   npx tsx scripts/probe-package-contents.ts --env <file> --package Z_ROOT --max-depth 99
 *
 * `--max-depth` is passed to the two package tools only (GetObjectsList has no depth input);
 * omit it to measure today's defaults, which differ per tool and are recorded in the
 * inventory: GetPackageTree walks five levels, GetPackageContents walks one.
 */
import * as path from 'node:path';
import { createAbapConnection } from '@mcp-abap-adt/connection';
import * as dotenv from 'dotenv';
import { getSapConfigFromEnv } from '../src/__tests__/integration/helpers/configHelpers';
import { handleGetPackageContents } from '../src/handlers/package/readonly/handleGetPackageContents';
import { handleGetObjectsList } from '../src/handlers/search/readonly/handleGetObjectsList';
import { handleGetPackageTree } from '../src/handlers/system/high/handleGetPackageTree';
import { resolveSystemContext } from '../src/lib/systemContext';

interface Measurement {
  tool: string;
  ok: boolean;
  requests: number;
  elapsedMs: number;
  count: number | null;
  metric: string;
  note: string;
}

/**
 * Count every HTTP call by wrapping the connection's axios instance.
 *
 * `getAxiosInstance()` is the single funnel: `makeAdtRequest`, `fetchCsrfToken` and the
 * 403-retry path all call it. Wrapping it therefore counts what was actually issued rather
 * than what the handler believes it issued — which matters here because the two package
 * tools do their walking inside adt-clients, where the handler cannot see it.
 */
function instrument(connection: any): {
  count: () => number;
  reset: () => void;
  ok: boolean;
} {
  let n = 0;
  const original = connection.getAxiosInstance;
  if (typeof original !== 'function') {
    return { count: () => -1, reset: () => {}, ok: false };
  }
  connection.getAxiosInstance = function patched(...args: unknown[]) {
    const instance = original.apply(this, args);
    // The instance is callable: `instance(requestConfig)`. Wrap the call itself.
    const wrapped = ((...callArgs: unknown[]) => {
      n += 1;
      return (instance as any)(...callArgs);
    }) as any;
    // Keep the axios surface (get/post/defaults/interceptors) reachable, and count those too.
    for (const key of Object.keys(instance)) {
      wrapped[key] = (instance as any)[key];
    }
    for (const verb of [
      'get',
      'post',
      'put',
      'delete',
      'patch',
      'head',
      'request',
    ]) {
      const fn = (instance as any)[verb];
      if (typeof fn === 'function') {
        wrapped[verb] = (...callArgs: unknown[]) => {
          n += 1;
          return fn.apply(instance, callArgs);
        };
      }
    }
    return wrapped;
  };
  return {
    count: () => n,
    reset: () => {
      n = 0;
    },
    ok: true,
  };
}

/** Count the nodes of a package tree, whatever shape adt-clients gave it. */
function countTreeNodes(node: unknown): number {
  if (!node || typeof node !== 'object') {
    return 0;
  }
  if (Array.isArray(node)) {
    let n = 0;
    for (const item of node) {
      n += countTreeNodes(item);
    }
    return n;
  }
  let n = 1;
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (value && typeof value === 'object') {
      n += countTreeNodes(value);
    }
  }
  return n;
}

function readCount(tool: string, result: any): number | null {
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') {
    return null;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (tool.startsWith('GetPackageContents')) {
    return Array.isArray(parsed) ? parsed.length : null;
  }
  if (tool === 'GetObjectsList') {
    return typeof parsed?.total_objects === 'number'
      ? parsed.total_objects
      : null;
  }
  if (tool === 'GetPackageTree') {
    return parsed?.tree ? countTreeNodes(parsed.tree) : null;
  }
  return null;
}

async function measure(
  meter: { count: () => number; reset: () => void },
  tool: string,
  metric: string,
  run: () => Promise<any>,
): Promise<Measurement> {
  meter.reset();
  const started = Date.now();
  try {
    const result = await run();
    const failed = result?.isError === true;
    return {
      tool,
      metric,
      ok: !failed,
      requests: meter.count(),
      elapsedMs: Date.now() - started,
      count: readCount(tool, result),
      note: failed
        ? String(result?.content?.[0]?.text ?? '').slice(0, 200)
        : '',
    };
  } catch (error) {
    return {
      tool,
      metric,
      ok: false,
      requests: meter.count(),
      elapsedMs: Date.now() - started,
      count: null,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const envFile = path.resolve(
    get('--env') || path.join(__dirname, '..', 'trial.env'),
  );
  dotenv.config({ path: envFile, override: true });

  const packageName = (get('--package') || '').toUpperCase();
  if (!packageName) {
    console.error(
      'Usage: npx tsx scripts/probe-package-contents.ts --env <file> --package <PKG> [--max-depth N]',
    );
    process.exit(2);
  }
  const maxDepthRaw = get('--max-depth');
  const maxDepth = maxDepthRaw ? Number(maxDepthRaw) : undefined;

  console.log(`env:       ${envFile}`);
  console.log(`package:   ${packageName}`);
  console.log(`max_depth: ${maxDepth ?? '(tool default)'}`);

  const connection = createAbapConnection(getSapConfigFromEnv()) as any;

  // Establish the session first, so the discovery/CSRF handshake is not charged to the
  // first tool measured. RFC connections need this explicitly; HTTP ones are idempotent.
  if (typeof connection.connect === 'function') {
    await connection.connect();
  }

  // Resolve the system context the handlers read (master system, responsible).
  const ctx = await resolveSystemContext(connection);
  console.log(
    `system:    client=${ctx.client ?? '(default)'} responsible=${ctx.responsible ?? '(unset)'}\n`,
  );

  const meter = instrument(connection);
  if (!meter.ok) {
    console.error(
      'FATAL: connection.getAxiosInstance is not a function on this connection type — ' +
        'the request counter would report nothing. Fix the counter before trusting any number.',
    );
    process.exit(3);
  }

  const context = { connection, logger: undefined } as any;
  const results: Measurement[] = [];

  results.push(
    await measure(meter, 'GetPackageTree', 'tree nodes', () =>
      handleGetPackageTree(context, {
        package_name: packageName,
        ...(maxDepth === undefined ? {} : { max_depth: maxDepth }),
      }),
    ),
  );

  results.push(
    await measure(meter, 'GetPackageContents (default)', 'list entries', () =>
      handleGetPackageContents(context, { package_name: packageName }),
    ),
  );

  results.push(
    await measure(meter, 'GetPackageContents (recursive)', 'list entries', () =>
      handleGetPackageContents(context, {
        package_name: packageName,
        include_subpackages: true,
        ...(maxDepth === undefined ? {} : { max_depth: maxDepth }),
      }),
    ),
  );

  results.push(
    await measure(meter, 'GetObjectsList', 'total_objects', () =>
      handleGetObjectsList(context, {
        parent_name: packageName,
        parent_tech_name: packageName,
        parent_type: 'DEVC/K',
      }),
    ),
  );

  console.log(
    'tool                            ok   requests    count  metric         ms',
  );
  console.log(
    '------------------------------  ---  --------  -------  -------------  -------',
  );
  for (const r of results) {
    console.log(
      `${r.tool.padEnd(30)}  ${(r.ok ? 'yes' : 'NO ').padEnd(3)}  ${String(r.requests).padStart(8)}  ${String(r.count ?? '-').padStart(7)}  ${r.metric.padEnd(13)}  ${String(r.elapsedMs).padStart(7)}`,
    );
    if (r.note) {
      console.log(`    note: ${r.note}`);
    }
  }
  console.log(
    '\nNotes for the record:\n' +
      "  - GetPackageTree's total includes ONE existence pre-check request its handler makes\n" +
      '    before walking (`// Verify package exists before building tree (fixes #38)`).\n' +
      '  - "count" is a different metric per tool; compare a tool to itself on another package,\n' +
      '    not to its neighbours.\n' +
      '  - Round trips are counted at getAxiosInstance(), so CSRF fetches and 403 retries are\n' +
      '    included; the initial connect() handshake is not.\n' +
      '\nRecord these numbers in docs/superpowers/specs/2026-09-09-tool-inventory.md,\n' +
      'section "The traversal bound", together with the system and package they came from.',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
