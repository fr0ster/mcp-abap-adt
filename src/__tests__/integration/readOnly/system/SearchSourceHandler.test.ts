/**
 * Integration tests for SearchSource handler.
 *
 * On premise and cloud — `available_in: ['onprem', 'cloud']`.
 *
 * The tests scan the case's `scan_package`, else the package configured under
 * `shared_dependencies.package`, and rely on the shared FM `Z_MCP_BLD_SHR_FM`
 * seeded by `shared:setup` to contain known marker substrings. Every case
 * that scans that package first requires the search to have read something
 * there (`expectScanned`), so a package holding no source fails naming the
 * config keys rather than passing with no hit to check.
 *
 * Run: npm run test:integration -- src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts
 */

import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import { handleSearchSource } from '../../../../handlers/system/readonly/handleSearchSource';
import { getSharedDependenciesConfig } from '../../helpers/configHelpers';
import { assertEquals } from '../../helpers/liveAssert';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { servedSuite } from '../../helpers/servedHere';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

interface SearchSourceResult {
  results: Array<{
    devclass: string;
    object_type: string;
    object_name: string;
    /** Absent on a function module's hit, which names its group instead (DO18). */
    include?: string;
    function_group_name?: string;
    line: number;
    snippet: string;
  }>;
  scanned: {
    objects: number;
    sources: number;
    objects_with_hits: number;
  };
  truncated: { by_object_cap: boolean };
}

/**
 * The package scanned: the case's own `scan_package`, else the shared package
 * (shared_dependencies.package), which the shared-objects setup creates and
 * seeds with the objects the queries look for, whatever the configuration
 * names it.
 */
function scanPackageOf(given: unknown): string {
  const pkg = String(given ?? getSharedDependenciesConfig()?.package ?? '');
  if (!pkg) {
    throw new Error(
      'scan_package (or shared_dependencies.package) is required',
    );
  }
  return pkg;
}

/** The case and its params, as a refusal names them. */
const CASE_PARAMS =
  'search_source_readonly.test_cases[name=test_search_source].params';

/** What chooses the scanned package. */
const PACKAGE_RULE = `${CASE_PARAMS}.scan_package, else shared_dependencies.package, must name a package holding the seeded objects`;

/** What chooses the object filter. */
const FILTER_RULE = `${CASE_PARAMS}.narrow_object_filter must be a glob over the package's objects — a function group, not its modules (the shared group, e.g. ZMCP_BLD_SHR_FGR*)`;

/**
 * The search read something in `where`, or the case fails naming the config
 * keys that choose what is scanned: a package holding no source the search
 * reads answers no hit whatever the query, which a bare `results.length > 0`
 * would not say.
 */
function expectScanned(
  data: SearchSourceResult,
  where: string,
  rule = PACKAGE_RULE,
): void {
  assert.ok(data.scanned.objects > 0, `nothing scanned in ${where}: ${rule}`);
}

function parseResult(result: any): SearchSourceResult {
  const text = result.content?.find((c: any) => c.type === 'text')?.text;
  if (typeof text !== 'string') {
    throw new Error('No text payload in SearchSource response');
  }
  return JSON.parse(text);
}

function deriveMaskFromPackage(pkg: string): string {
  // Keep the mask narrow so integration tests stay fixture-scoped.
  // Tails of 5+ chars are trimmed by one (ZADT_BLD_PKG03 -> ZADT_BLD_PKG0*);
  // shorter tails keep the full segment (/NS/ZFOO -> /NS/ZFOO*).
  const slashTail = pkg.lastIndexOf('/');
  const prefixEnd = slashTail >= 0 ? slashTail + 1 : 0;
  const tail = pkg.slice(prefixEnd);
  const stem = tail.length > 4 ? tail.slice(0, tail.length - 1) : tail;
  return pkg.slice(0, prefixEnd) + stem + '*';
}

/**
 * Whether `name` matches the package `mask`, letter case aside: `*` any run
 * of characters, `+` one character, every other character itself. Plain
 * code over the two strings.
 */
function matchesMask(name: string, mask: string): boolean {
  const text = name.toUpperCase();
  const pattern = mask.toUpperCase();
  const from = (at: number, p: number): boolean => {
    if (p === pattern.length) return at === text.length;
    const ch = pattern[p];
    if (ch === '*') {
      for (let next = at; next <= text.length; next += 1) {
        if (from(next, p + 1)) return true;
      }
      return false;
    }
    if (at === text.length) return false;
    return (ch === '+' || ch === text[at]) && from(at + 1, p + 1);
  };
  return from(0, 0);
}

/**
 * This file's `describe`: the suite runs where the configured system serves
 * every tool it calls, and skips naming the first it does not serve.
 */
const describe = servedSuite(['SearchSource']);

describe('SearchSource Handler Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('search-source-test');

  before(async () => {
    tester = new LambdaTester(
      'search_source_readonly',
      'test_search_source',
      'search-source-test',
    );
    await tester.beforeAll(
      async (_context: LambdaTesterContext) => {
        logger?.info('🔧 SearchSource test setup complete');
      },
      async (_context: LambdaTesterContext) => {
        logger?.info('🧹 No cleanup needed for read-only handler');
      },
    );
  });

  after(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      logger?.info('🔚 Test suite cleanup complete');
    });
  });

  it('finds a known substring in the seeded shared package', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);
      const query = String(params?.known_query ?? 'Echo:');

      const args = {
        detail: 'full' as const,
        query,
        packages: [pkg],
        max_hits_per_object: 5,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, pkg);
      assert.ok(data.results.length > 0);
      for (const hit of data.results) {
        assert.ok(hit.snippet.toLowerCase().includes(query.toLowerCase()));
      }
    });
  });

  it('AND-query: both query and query2 must appear on the same matched line', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);
      const q = String(params?.known_query ?? 'Echo:');
      const q2 = String(params?.known_and_query ?? 'iv_input');

      const args = {
        detail: 'full' as const,
        query: q,
        query2: q2,
        packages: [pkg],
        max_hits_per_object: 5,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, pkg);
      for (const hit of data.results) {
        const lower = hit.snippet.toLowerCase();
        assert.ok(lower.includes(q.toLowerCase()));
        assert.ok(lower.includes(q2.toLowerCase()));
      }
    });
  });

  it('exclude filter drops lines that contain the excluded substring', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);
      const q = String(params?.known_query ?? 'Echo:');
      const excl = String(params?.known_exclude ?? 'ev_output');

      const args = {
        detail: 'full' as const,
        query: q,
        exclude: [excl],
        packages: [pkg],
        max_hits_per_object: 50,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, pkg);
      for (const hit of data.results) {
        assert.ok(!hit.snippet.toLowerCase().includes(excl.toLowerCase()));
      }
    });
  });

  it('exclude_comments=true never returns lines whose first char is `*` or whose first non-ws char is `"`', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);
      const q = String(params?.known_query ?? 'Echo:');

      const args = {
        detail: 'full' as const,
        query: q,
        packages: [pkg],
        exclude_comments: true,
        max_hits_per_object: 50,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, pkg);
      for (const hit of data.results) {
        assert.notEqual(hit.snippet[0], '*');
        const trimmed = hit.snippet.replace(/^\s+/, '');
        assert.notEqual(trimmed[0], '"');
      }
    });
  });

  it('max_hits_per_object=1 yields ≤ 1 hit per object_name and flips truncated.by_object_cap when capped', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);
      const q = String(params?.known_query ?? 'Echo:');

      const args = {
        detail: 'full' as const,
        query: q,
        packages: [pkg],
        max_hits_per_object: 1,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, pkg);
      const byObject = new Map<string, number>();
      for (const hit of data.results) {
        const key = `${hit.devclass}/${hit.object_type}/${hit.object_name}`;
        byObject.set(key, (byObject.get(key) ?? 0) + 1);
      }
      for (const count of byObject.values()) {
        assert.ok(count <= 1);
      }
    });
  });

  it('an object without a hit is not listed: no results, no no_hits, the objects read still counted', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);

      const args = {
        detail: 'full' as const,
        query: 'ABSOLUTELY_UNLIKELY_SUBSTRING_XYZQ_42',
        packages: [pkg],
        max_hits_per_object: 1,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, pkg);
      assertEquals(data.results, []);
      assert.ok(!Object.keys(data).includes('no_hits'));
      assert.ok(!Object.keys(data).includes('failures'));
      assert.equal(data.scanned.objects_with_hits, 0);
    });
  });

  it('object_filter narrows the scan — only hits of matching objects (a group for its modules) appear in results', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);
      const q = String(params?.known_query ?? 'Echo:');
      const glob = String(params?.narrow_object_filter ?? 'ZMCP_BLD_SHR_FGR*');
      const matcher = new RegExp(
        `^${glob.replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
        'i',
      );

      const args = {
        detail: 'full' as const,
        query: q,
        packages: [pkg],
        object_filter: glob,
        max_hits_per_object: 5,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, `${pkg} filtered by ${glob}`, FILTER_RULE);
      // The filter selects the package's objects: a hit in a function group
      // (a module or an include) is filtered by its group.
      for (const hit of data.results) {
        const scannedObject = hit.function_group_name ?? hit.object_name;
        assert.equal(matcher.test(scannedObject), true, scannedObject);
      }
    });
  });

  it('mask derived from the shared package yields hits (include_subpackages: true)', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);
      const query = String(params?.known_query ?? 'Echo:');
      const mask = deriveMaskFromPackage(pkg);

      const args = {
        detail: 'full' as const,
        query,
        packages: [mask],
        include_subpackages: true,
        max_hits_per_object: 5,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, mask);
      assert.ok(data.results.length > 0);
    });
  });

  it('mask derived from the shared package matches devclass when include_subpackages: false', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);
      const query = String(params?.known_query ?? 'Echo:');
      const mask = deriveMaskFromPackage(pkg);

      const args = {
        detail: 'full' as const,
        query,
        packages: [mask],
        include_subpackages: false,
        max_hits_per_object: 5,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, mask);
      assert.ok(data.results.length > 0);
      for (const hit of data.results) {
        assert.ok(matchesMask(hit.devclass, mask), hit.devclass);
      }
    });
  });

  it('pattern that resolves to zero packages returns an empty result', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const query = String(params?.known_query ?? 'Echo:');

      const args = {
        detail: 'full' as const,
        query,
        packages: ['ZZZ_NONEXISTENT_NAMESPACE_XYZ*'],
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      assertEquals(data.results, []);
      // No package counter (DO26): a missing package is no hit, nothing counted.
      assert.equal('packages' in data.scanned, false);
      assert.equal(data.scanned.objects, 0);
    });
  });

  it('mixed [shared.package, mask] preserves hits from the shared package', async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = scanPackageOf(params?.scan_package);
      const query = String(params?.known_query ?? 'Echo:');
      const mask = deriveMaskFromPackage(pkg);

      const args = {
        detail: 'full' as const,
        query,
        packages: [pkg, mask],
        include_subpackages: true,
        max_hits_per_object: 5,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      assert.equal(result.isError, false);
      const data = parseResult(result);
      expectScanned(data, pkg);
      assert.ok(data.results.length > 0);
      const devclasses = new Set(data.results.map((h) => h.devclass));
      assert.equal(devclasses.has(pkg), true);
    });
  });
});
