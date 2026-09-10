/**
 * Measure the traversal cost of the three walking tools, so the safety bound the
 * result/error-strategies design leaves to stage 1 is a measurement rather than a guess.
 *
 * The design (docs/superpowers/specs/2026-09-08-result-error-strategies-design.md) makes
 * `GetPackageTree`, `GetPackageContents` and `GetObjectsList` bounded traversals that say so
 * in their answer. It deliberately does not fix the bound: "it is a number, not a principle,
 * and belongs with the inventory that shows how large real packages are."
 *
 * This script runs each of the three against one real package and reports, per tool:
 *   - how many HTTP round trips the walk cost, and
 *   - how many objects came back.
 *
 * It counts round trips by wrapping the connection's own request method, so the number is
 * what the tool actually issued rather than what the handler believes it issued — including
 * anything adt-clients does inside `getPackageHierarchy` and `getPackageContentsList`.
 *
 * Nothing is written: all three tools are read-only.
 *
 * Usage:
 *   npx tsx scripts/probe-package-contents.ts --env trial.env --package ZMY_PACKAGE
 *   npx tsx scripts/probe-package-contents.ts --env trial.env --package Z_ROOT --max-depth 99
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

interface Measurement {
  tool: string;
  ok: boolean;
  requests: number;
  elapsedMs: number;
  objects: number | null;
  note: string;
}

/**
 * Wrap every request-issuing method on the connection with a counter.
 *
 * The connection exposes more than one entry point depending on auth type, so each candidate
 * is patched when present rather than assuming one name. The counter is shared, and reset
 * between tools by the caller.
 */
function instrument(connection: any): {
  count: () => number;
  reset: () => void;
} {
  let n = 0;
  const methods = ['makeAdtRequest', 'request', 'get', 'post', 'put', 'delete'];
  for (const name of methods) {
    const original = connection[name];
    if (typeof original !== 'function') {
      continue;
    }
    connection[name] = function patched(...args: unknown[]) {
      n += 1;
      return original.apply(this, args);
    };
  }
  return {
    count: () => n,
    reset: () => {
      n = 0;
    },
  };
}

/** Pull the object count out of whichever shape the tool answered with. */
function countObjects(result: any): number | null {
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
  if (Array.isArray(parsed)) {
    return parsed.length; // GetPackageContents answers a bare array
  }
  if (typeof parsed?.total_objects === 'number') {
    return parsed.total_objects; // GetObjectsList
  }
  if (parsed?.tree) {
    let n = 0;
    const walk = (node: any): void => {
      if (!node || typeof node !== 'object') {
        return;
      }
      if (Array.isArray(node)) {
        for (const item of node) {
          walk(item);
        }
        return;
      }
      n += 1;
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object') {
          walk(value);
        }
      }
    };
    walk(parsed.tree);
    return n; // GetPackageTree — nodes reached, not objects strictly
  }
  return null;
}

async function measure(
  meter: { count: () => number; reset: () => void },
  tool: string,
  run: () => Promise<any>,
): Promise<Measurement> {
  meter.reset();
  const started = Date.now();
  try {
    const result = await run();
    const failed = result?.isError === true;
    return {
      tool,
      ok: !failed,
      requests: meter.count(),
      elapsedMs: Date.now() - started,
      objects: countObjects(result),
      note: failed
        ? String(result?.content?.[0]?.text ?? '').slice(0, 200)
        : '',
    };
  } catch (error) {
    return {
      tool,
      ok: false,
      requests: meter.count(),
      elapsedMs: Date.now() - started,
      objects: null,
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

  console.log(`env:      ${envFile}`);
  console.log(`package:  ${packageName}`);
  console.log(`max_depth: ${maxDepth ?? '(tool default)'}\n`);

  const connection = createAbapConnection(getSapConfigFromEnv()) as any;
  const meter = instrument(connection);
  const context = { connection, logger: undefined } as any;

  const results: Measurement[] = [];

  results.push(
    await measure(meter, 'GetPackageTree', () =>
      handleGetPackageTree(context, {
        package_name: packageName,
        ...(maxDepth === undefined ? {} : { max_depth: maxDepth }),
      }),
    ),
  );

  results.push(
    await measure(meter, 'GetPackageContents (default: one level)', () =>
      handleGetPackageContents(context, { package_name: packageName }),
    ),
  );

  results.push(
    await measure(meter, 'GetPackageContents (recursive)', () =>
      handleGetPackageContents(context, {
        package_name: packageName,
        include_subpackages: true,
        ...(maxDepth === undefined ? {} : { max_depth: maxDepth }),
      }),
    ),
  );

  results.push(
    await measure(meter, 'GetObjectsList', () =>
      handleGetObjectsList(context, {
        parent_name: packageName,
        parent_tech_name: packageName,
        parent_type: 'DEVC/K',
      }),
    ),
  );

  console.log(
    'tool                                    ok   requests  objects  ms',
  );
  console.log(
    '--------------------------------------  ---  --------  -------  -------',
  );
  for (const r of results) {
    console.log(
      `${r.tool.padEnd(38)}  ${(r.ok ? 'yes' : 'NO ').padEnd(3)}  ${String(r.requests).padStart(8)}  ${String(r.objects ?? '-').padStart(7)}  ${String(r.elapsedMs).padStart(7)}`,
    );
    if (r.note) {
      console.log(`    note: ${r.note}`);
    }
  }
  console.log(
    '\nRecord these numbers in docs/superpowers/specs/2026-09-09-tool-inventory.md,\n' +
      'section "The traversal bound", together with the package they were measured on.',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
