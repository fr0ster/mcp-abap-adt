/**
 * Three read tools, live, read only, through the stdio binary a user runs
 * (each case launches its own, guarded, `launchStdio`), each against what
 * SAP itself answers to a raw read-only GET on the suite's connection.
 *
 * - `GetWhereUsed`, on premise: a where-used list above the stdio message
 *   limit is answered an error, and the server answers the next call. The
 *   object is `whereused_readonly.test_whereused.oversized_class`; the case
 *   skips naming it when the config states none.
 * - `GetPackageContents` with subpackages, on both systems: the shared
 *   package's super package (`shared_dependencies.super_package`; the case
 *   skips naming it when the config leaves it blank) lists each row once,
 *   and each subpackage SAP's package document names once.
 * - `SearchObject`, on both systems: for each mask, as many rows as SAP's
 *   quick search answers to the same query.
 *
 * The tools are called on the launched server, not through `liveCall`: what
 * is under test includes the stdio transport. Nothing is created, changed
 * or deleted.
 */
import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  ONE_MESSAGE_WORDS,
  oversizedAnswerWords,
} from '../../../../server-runtime/src/stdio/boundedStdioTransport';
import { handleGetWhereUsed } from '../../../handlers/system/readonly/handleGetWhereUsed';
import type { McpResult } from '../../../lib/answer';
import {
  configuredSystemKind,
  getSharedDependenciesConfig,
  getTestCase,
  loadTestConfig,
} from '../helpers/configHelpers';
import type { LaunchedServer } from '../helpers/launchedServers';
import { liveConnection, liveSuite } from '../helpers/live';
import { createTestLogger } from '../helpers/loggerHelpers';
import { skipRunningTest } from '../helpers/runningTest';
import {
  type FullWhereUsedReference,
  headOf,
  terseOf,
  whereUsedTerseMismatches,
} from '../helpers/terseAnswer';
import {
  destinationArgs,
  getHardModeConfig,
  launchStdio,
  testConnectionLogOn,
} from '../helpers/testers/hardMode';
import { createHandlerContext } from '../helpers/testHelpers';
import { member } from './ownObjects';

/** The class the config names for an answer above the stdio limit, or undefined. */
function oversizedClass(): string | undefined {
  const named = member(
    getTestCase('whereused_readonly', 'test_whereused')?.params,
    'oversized_class',
  );
  return typeof named === 'string' && named !== '' ? named : undefined;
}

/** The shared package's super package, or undefined when the config leaves it blank. */
function superPackage(): string | undefined {
  const named = member(getSharedDependenciesConfig(), 'super_package');
  return typeof named === 'string' && named !== ''
    ? named.toUpperCase()
    : undefined;
}

/** The full set's stdio binary for the configured system, guarded. */
function launched(): Promise<LaunchedServer> {
  const kind = configuredSystemKind();
  if (kind === undefined) throw new Error('the test config states no kind');
  return launchStdio({
    set: 'full',
    kind,
    args: destinationArgs(getHardModeConfig(), loadTestConfig()),
    logOn: testConnectionLogOn,
  });
}

/** An answer's text, or the case fails naming the tool and what was answered. */
function textOf(tool: string, answer: McpResult): string {
  const text = answer.content.map((item) => item.text).join('\n');
  if (answer.isError) throw new Error(`${tool}: ${text.slice(0, 2000)}`);
  return text;
}

/**
 * The sizes the stdio transport's refusal of an oversized answer names
 * (`oversizedAnswerWords`), when `error` is exactly that refusal; else
 * `undefined`. Plain string reading of our own words.
 */
function limitRefusal(
  error: unknown,
): { size: number; cap: number } | undefined {
  if (!(error instanceof Error)) return undefined;
  const message = error.message;
  const start = message.indexOf('The answer is ');
  if (start < 0) return undefined;
  const after = message.slice(start + 'The answer is '.length);
  const sizeEnd = after.indexOf(' bytes, above the ');
  if (sizeEnd < 0) return undefined;
  const rest = after.slice(sizeEnd + ' bytes, above the '.length);
  const capEnd = rest.indexOf(` ${ONE_MESSAGE_WORDS}`);
  if (capEnd < 0) return undefined;
  const size = Number(after.slice(0, sizeEnd));
  const cap = Number(rest.slice(0, capEnd));
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(cap)) {
    return undefined;
  }
  return message.endsWith(oversizedAnswerWords(size, cap))
    ? { size, cap }
    : undefined;
}

/** The body of a raw read-only GET on the suite's connection. */
async function rawGet(url: string, accept: string): Promise<string> {
  const response = await liveConnection().makeAdtRequest({
    url,
    method: 'GET',
    timeout: 0,
    headers: { Accept: accept },
  });
  assert.equal(response.status, 200, `GET ${url} answered ${response.status}`);
  return typeof response.data === 'string' ? response.data : '';
}

/** How many times `part` occurs in `text`. */
function occurrences(text: string, part: string): number {
  let count = 0;
  for (let at = text.indexOf(part); at !== -1; at = text.indexOf(part, at + 1))
    count += 1;
  return count;
}

/** Each `adtcore:name` inside the `pak:subPackages` element of a package document. */
function subpackagesOf(document: string): string[] {
  const start = document.indexOf('<pak:subPackages>');
  const end = document.indexOf('</pak:subPackages>');
  if (start === -1 || end === -1) return [];
  const names: string[] = [];
  const marker = 'adtcore:name="';
  const element = document.slice(start, end);
  for (
    let at = element.indexOf(marker);
    at !== -1;
    at = element.indexOf(marker, at + 1)
  ) {
    const from = at + marker.length;
    names.push(element.slice(from, element.indexOf('"', from)));
  }
  return names;
}

/** SAP's quick search hits for `mask`, `maxResults` 100. */
async function quickSearchHits(mask: string): Promise<number> {
  const raw = await rawGet(
    `/sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=${encodeURIComponent(mask)}&maxResults=100`,
    'application/xml',
  );
  return occurrences(raw, '<adtcore:objectReference ');
}

/** SearchObject's rows for `mask`, `maxResults` 100, its header left out. */
async function searchRows(server: LaunchedServer, mask: string) {
  const text = textOf(
    'SearchObject',
    await server.call('SearchObject', {
      object_name: mask,
      maxResults: 100,
      background: false,
    }),
  );
  return {
    text,
    rows: text
      .split('\n')
      .filter((line) => line !== '' && !line.startsWith('name\t')).length,
  };
}

liveSuite(['onprem'], 'GetWhereUsed over stdio above the message limit', () => {
  it('is answered an error, and the server answers the next call', async () => {
    const name = oversizedClass();
    if (name === undefined) {
      skipRunningTest(
        'the config names no whereused_readonly.test_whereused.oversized_class',
      );
      return;
    }
    const server = await launched();
    try {
      // The whole answer (detail full): terse fits the limit, below.
      await assert.rejects(
        server.call('GetWhereUsed', {
          object_name: name,
          object_type: 'CLAS/OC',
          detail: 'full',
          background: false,
        }),
        (error: unknown) =>
          error instanceof Error && error.message.includes(ONE_MESSAGE_WORDS),
      );
      const next = await searchRows(server, name);
      assert.equal(next.rows, 1, next.text);
    } finally {
      await server.close();
    }
  });

  // How long one stdio message may be is the client's
  // (`--stdio-message-limit`, `MCP_STDIO_MESSAGE_LIMIT`): terse answers
  // every usage, and an answer above the limit is the transport's refusal
  // naming both sizes — either outcome, nothing else.
  it('terse, the default, answers every usage, or is refused naming both sizes above the limit', async () => {
    const name = oversizedClass();
    if (name === undefined) {
      skipRunningTest(
        'the config names no whereused_readonly.test_whereused.oversized_class',
      );
      return;
    }
    const server = await launched();
    try {
      let called: McpResult;
      try {
        called = await server.call('GetWhereUsed', {
          object_name: name,
          object_type: 'CLAS/OC',
          background: false,
        });
      } catch (error) {
        const refused = limitRefusal(error);
        assert.ok(refused !== undefined, String(error));
        assert.ok(refused.size > refused.cap, String(error));
        console.log(
          `[readToolBugs] GetWhereUsed ${name} terse: ${refused.size} bytes, above the ${refused.cap}-byte stdio limit`,
        );
        return;
      }
      const text = textOf('GetWhereUsed', called);
      const answer = terseOf(text);
      const shown = text.slice(0, 2000);
      const total = `# total ${headOf(answer, 'total') ?? ''}`;
      assert.ok(Number.isFinite(Number(headOf(answer, 'total'))), shown);
      // The usages SAP answered, as rows under their package, each read by
      // the header's column names; every usage the same call's full answer
      // resolves is a row by its real type and name — a usage inside a
      // method or section by the object it is in, the element beside it —
      // and one full leaves unresolved a row by its URI.
      for (const column of ['type', 'name', 'element', 'usage']) {
        assert.ok(answer.columns.includes(column), shown);
      }
      assert.ok(answer.rows.length > 0, shown);
      // The full answer is above the stdio limit (the case above): read it
      // on the suite's connection, through the handler.
      const full: { references: FullWhereUsedReference[] } = JSON.parse(
        textOf(
          'GetWhereUsed',
          await handleGetWhereUsed(
            createHandlerContext({
              connection: liveConnection(),
              logger: createTestLogger('readToolBugs'),
            }),
            { object_name: name, object_type: 'CLAS/OC', detail: 'full' },
          ),
        ),
      );
      assert.deepStrictEqual(
        whereUsedTerseMismatches(answer, full.references),
        [],
        shown,
      );
      console.log(
        `[readToolBugs] GetWhereUsed ${name} terse: ${text.length} characters, ${total}`,
      );
    } finally {
      await server.close();
    }
  });
});

liveSuite(
  ['onprem', 'cloud'],
  'GetPackageContents with subpackages lists each once',
  () => {
    it('each row once, each subpackage SAP names once', async () => {
      const pkg = superPackage();
      if (pkg === undefined) {
        skipRunningTest(
          'the config leaves shared_dependencies.super_package blank: no package with a subpackage to walk',
        );
        return;
      }
      const server = await launched();
      let text: string;
      try {
        text = textOf(
          'GetPackageContents',
          await server.call('GetPackageContents', {
            package_name: pkg,
            include_subpackages: true,
            background: false,
          }),
        );
      } finally {
        await server.close();
      }
      // Terse, the default: `type\tname\ttech_name` rows under `# package` lines.
      const keys: string[] = [];
      let owner = '';
      for (const line of text.split('\n')) {
        if (line.startsWith('# package ')) {
          owner = line.slice('# package '.length);
          continue;
        }
        if (
          line === '' ||
          line.startsWith('#') ||
          line.startsWith('type\tname')
        ) {
          continue;
        }
        const [type, rowName] = line.split('\t');
        keys.push(`${type} ${rowName} in ${owner}`);
      }
      assert.ok(keys.length > 0, text.slice(0, 2000));
      assert.deepEqual(
        keys.filter((key, i) => keys.indexOf(key) !== i),
        [],
        'rows listed more than once',
      );
      const document = await rawGet(
        `/sap/bc/adt/packages/${encodeURIComponent(pkg.toLowerCase())}`,
        'application/vnd.sap.adt.packages.v2+xml',
      );
      for (const sub of subpackagesOf(document)) {
        assert.equal(
          keys.filter((key) => key === `DEVC/K ${sub} in ${pkg}`).length,
          1,
          `subpackage ${sub} of ${pkg}`,
        );
      }
    });
  },
);

liveSuite(['onprem', 'cloud'], 'SearchObject answers every hit', () => {
  it("each mask: as many rows as SAP's quick search", async () => {
    const server = await launched();
    try {
      for (const mask of ['CL_ABAP_UNIT*', 'CL_ABAP_U*']) {
        const answered = await quickSearchHits(mask);
        const { rows, text } = await searchRows(server, mask);
        assert.equal(rows, answered, `${mask}: ${text.slice(0, 2000)}`);
      }
    } finally {
      await server.close();
    }
  });
});
