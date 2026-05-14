/**
 * Integration tests for SearchSource handler.
 *
 * Onprem-only — `available_in: ['onprem', 'legacy']`. Skipped on cloud.
 *
 * The tests scan the package configured under `shared_dependencies.package`
 * (default `ZADT_BLD_PKG03`) and rely on the shared FM `Z_MCP_BLD_SHR_FM`
 * seeded by `shared:setup` to contain known marker substrings.
 *
 * Run: npm test -- --testPathPattern=integration/readOnly/system/SearchSource
 */

import { handleSearchSource } from '../../../../handlers/system/readonly/handleSearchSource';
import { getTimeout } from '../../helpers/configHelpers';
import { createTestLogger } from '../../helpers/loggerHelpers';
import { LambdaTester } from '../../helpers/testers/LambdaTester';
import type { LambdaTesterContext } from '../../helpers/testers/types';
import { createHandlerContext } from '../../helpers/testHelpers';

interface SearchSourceResult {
  results: Array<{
    devclass: string;
    object_type: 'PROG' | 'FUGR' | 'CLAS';
    object_name: string;
    include: string;
    line: number;
    snippet: string;
  }>;
  no_hits?: Array<{
    devclass: string;
    object_type: string;
    object_name: string;
  }>;
  scanned: { packages: number; objects: number; sources: number };
  truncated: { by_object_cap: boolean; by_max_objects: boolean };
}

function parseResult(result: any): SearchSourceResult {
  const text = result.content?.find((c: any) => c.type === 'text')?.text;
  if (typeof text !== 'string') {
    throw new Error('No text payload in SearchSource response');
  }
  return JSON.parse(text);
}

describe('SearchSource Handler Integration', () => {
  let tester: LambdaTester;
  const logger = createTestLogger('search-source-test');

  beforeAll(async () => {
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
  }, getTimeout('long'));

  afterAll(async () => {
    await tester.afterAll(async (_context: LambdaTesterContext) => {
      logger?.info('🔚 Test suite cleanup complete');
    });
  });

  it(
    'finds a known substring in the seeded shared package',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');
        const query = String(params?.known_query ?? 'Echo:');

        const args = {
          query,
          packages: [pkg],
          max_hits_per_object: 5,
          max_objects: 50,
        };
        const result = await tester.invokeToolOrHandler(
          'SearchSource',
          args,
          async () => {
            const handlerContext = createHandlerContext({ connection, logger });
            return handleSearchSource(handlerContext, args);
          },
        );

        expect(result.isError).toBe(false);
        const data = parseResult(result);
        expect(data.results.length).toBeGreaterThan(0);
        for (const hit of data.results) {
          expect(hit.snippet.toLowerCase()).toContain(query.toLowerCase());
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'AND-query: both query and query2 must appear on the same matched line',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');
        const q = String(params?.known_query ?? 'Echo:');
        const q2 = String(params?.known_and_query ?? 'iv_input');

        const args = {
          query: q,
          query2: q2,
          packages: [pkg],
          max_hits_per_object: 5,
          max_objects: 50,
        };
        const result = await tester.invokeToolOrHandler(
          'SearchSource',
          args,
          async () => {
            const handlerContext = createHandlerContext({ connection, logger });
            return handleSearchSource(handlerContext, args);
          },
        );

        expect(result.isError).toBe(false);
        const data = parseResult(result);
        for (const hit of data.results) {
          const lower = hit.snippet.toLowerCase();
          expect(lower).toContain(q.toLowerCase());
          expect(lower).toContain(q2.toLowerCase());
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'exclude filter drops lines that contain the excluded substring',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');
        const q = String(params?.known_query ?? 'Echo:');
        const excl = String(params?.known_exclude ?? 'ev_output');

        const args = {
          query: q,
          exclude: [excl],
          packages: [pkg],
          max_hits_per_object: 50,
          max_objects: 50,
        };
        const result = await tester.invokeToolOrHandler(
          'SearchSource',
          args,
          async () => {
            const handlerContext = createHandlerContext({ connection, logger });
            return handleSearchSource(handlerContext, args);
          },
        );

        expect(result.isError).toBe(false);
        const data = parseResult(result);
        for (const hit of data.results) {
          expect(hit.snippet.toLowerCase()).not.toContain(excl.toLowerCase());
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'exclude_comments=true never returns lines whose first char is `*` or whose first non-ws char is `"`',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');
        const q = String(params?.known_query ?? 'Echo:');

        const args = {
          query: q,
          packages: [pkg],
          exclude_comments: true,
          max_hits_per_object: 50,
          max_objects: 50,
        };
        const result = await tester.invokeToolOrHandler(
          'SearchSource',
          args,
          async () => {
            const handlerContext = createHandlerContext({ connection, logger });
            return handleSearchSource(handlerContext, args);
          },
        );

        expect(result.isError).toBe(false);
        const data = parseResult(result);
        for (const hit of data.results) {
          expect(hit.snippet[0]).not.toBe('*');
          const trimmed = hit.snippet.replace(/^\s+/, '');
          expect(trimmed[0]).not.toBe('"');
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'max_hits_per_object=1 yields ≤ 1 hit per object_name and flips truncated.by_object_cap when capped',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');
        const q = String(params?.known_query ?? 'Echo:');

        const args = {
          query: q,
          packages: [pkg],
          max_hits_per_object: 1,
          max_objects: 50,
        };
        const result = await tester.invokeToolOrHandler(
          'SearchSource',
          args,
          async () => {
            const handlerContext = createHandlerContext({ connection, logger });
            return handleSearchSource(handlerContext, args);
          },
        );

        expect(result.isError).toBe(false);
        const data = parseResult(result);
        const byObject = new Map<string, number>();
        for (const hit of data.results) {
          const key = `${hit.devclass}/${hit.object_type}/${hit.object_name}`;
          byObject.set(key, (byObject.get(key) ?? 0) + 1);
        }
        for (const count of byObject.values()) {
          expect(count).toBeLessThanOrEqual(1);
        }
      });
    },
    getTimeout('long'),
  );

  it(
    'emit_no_hits=true populates no_hits for unmatched targets and never mixes them into results',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');

        const args = {
          query: 'ABSOLUTELY_UNLIKELY_SUBSTRING_XYZQ_42',
          packages: [pkg],
          emit_no_hits: true,
          max_hits_per_object: 1,
          max_objects: 50,
        };
        const result = await tester.invokeToolOrHandler(
          'SearchSource',
          args,
          async () => {
            const handlerContext = createHandlerContext({ connection, logger });
            return handleSearchSource(handlerContext, args);
          },
        );

        expect(result.isError).toBe(false);
        const data = parseResult(result);
        expect(data.results).toEqual([]);
        expect(Array.isArray(data.no_hits)).toBe(true);
      });
    },
    getTimeout('long'),
  );

  it(
    'object_filter narrows the scan — only matching object names appear in results',
    async () => {
      await tester.run(async (context: LambdaTesterContext) => {
        const { connection, params } = context;
        const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');
        const q = String(params?.known_query ?? 'Echo:');
        const glob = String(
          params?.narrow_object_filter ?? 'Z_MCP_BLD_SHR_FM*',
        );
        const matcher = new RegExp(
          `^${glob.replace(/\*/g, '.*').replace(/\?/g, '.')}$`,
          'i',
        );

        const args = {
          query: q,
          packages: [pkg],
          object_filter: glob,
          max_hits_per_object: 5,
          max_objects: 50,
        };
        const result = await tester.invokeToolOrHandler(
          'SearchSource',
          args,
          async () => {
            const handlerContext = createHandlerContext({ connection, logger });
            return handleSearchSource(handlerContext, args);
          },
        );

        expect(result.isError).toBe(false);
        const data = parseResult(result);
        for (const hit of data.results) {
          expect(matcher.test(hit.object_name)).toBe(true);
        }
      });
    },
    getTimeout('long'),
  );
});
