/**
 * The runtime refuses a second copy of `@mcp-abap-adt/lib` at start.
 *
 * Each loaded copy of lib registers one entry on a process-wide array — from
 * 24.0.0 on `{ version, label }`, before it `{ file }`; each transport's
 * `main` reads it first — before `--version`, before any parameter, before
 * anything listens — and with more than one entry stops with exit `1` and one
 * line on stderr naming the first two copies (an earlier one in fixed words,
 * never its file) and the package to reinstall. One entry starts as today.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { LauncherEdges, LibInstance } from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { repositoryRoot } from '../../../src/__tests__/helpers/repoRoot';
import { main as httpMain } from '../http/launcher';
import { secondCopyLine } from '../secondCopy';
import { main as sseMain } from '../sse/launcher';
import { main as stdioMain } from '../stdio/launcher';

const REGISTRY = Symbol.for('@mcp-abap-adt/lib/instances');

const FIRST: LibInstance = { version: '24.0.0', label: 'dist' };
const SECOND: LibInstance = { version: '24.1.0', label: 'bundled' };
const THIRD: LibInstance = { version: '24.2.0', label: 'dist' };
/** A copy before 24.0.0: it registered its file. */
const EARLIER_FILE =
  '/global/a/node_modules/@mcp-abap-adt/lib/dist/lib/instance.js';
const EARLIER: LibInstance = { file: EARLIER_FILE };

const lineFor = (pkg: string, a = '24.0.0 dist', b = '24.1.0 bundled') =>
  `Two copies of @mcp-abap-adt/lib are loaded in this process (${a}, ${b}): reinstall ${pkg} (npm install -g ${pkg}).`;

let saved: unknown;
beforeEach(() => {
  saved = Reflect.get(globalThis, REGISTRY);
});
afterEach(() => {
  Reflect.set(globalThis, REGISTRY, saved);
  mock.restoreAll();
});

function register(...entries: LibInstance[]): void {
  Reflect.set(
    globalThis,
    REGISTRY,
    entries.map((entry) => Object.freeze({ ...entry })),
  );
}

interface Recorded {
  stdout: string[];
  stderr: string[];
  exits: number[];
  argvReads: number;
}

/** Edges that record every line and exit, and count each read of `argv`. */
function recordingEdges(argv: string[] = []) {
  const record: Recorded = { stdout: [], stderr: [], exits: [], argvReads: 0 };
  const edges: LauncherEdges = {
    get argv() {
      record.argvReads += 1;
      return argv;
    },
    stdout: (line) => record.stdout.push(line),
    stderr: (line) => record.stderr.push(line),
    exit: (code) => record.exits.push(code),
    processLike: new EventEmitter(),
  };
  return { edges, record };
}

const TRANSPORTS = [
  ['stdio', stdioMain],
  ['http', httpMain],
  ['sse', sseMain],
] as const;

describe('secondCopyLine', () => {
  it('one entry: undefined', () => {
    assert.equal(secondCopyLine([FIRST], '@mcp-abap-adt/core'), undefined);
  });

  it('no entry (a process that loaded no lib cannot ask): undefined, as one', () => {
    assert.equal(secondCopyLine([], '@mcp-abap-adt/core'), undefined);
  });

  it('two entries: the line, verbatim, naming both copies and the package', () => {
    assert.equal(
      secondCopyLine([FIRST, SECOND], '@mcp-abap-adt/http'),
      lineFor('@mcp-abap-adt/http'),
    );
  });

  it('three entries: the first two copies', () => {
    assert.equal(
      secondCopyLine([FIRST, SECOND, THIRD], '@mcp-abap-adt/sse'),
      lineFor('@mcp-abap-adt/sse'),
    );
  });

  it('a copy before 24.0.0 is named in fixed words, never by its file', () => {
    const line = secondCopyLine([EARLIER, FIRST], '@mcp-abap-adt/core');
    assert.equal(
      line,
      lineFor('@mcp-abap-adt/core', 'a copy before 24.0.0', '24.0.0 dist'),
    );
    assert.ok(!line?.includes(EARLIER_FILE));
  });
});

for (const [name, main] of TRANSPORTS) {
  describe(`${name}'s main`, () => {
    it('two registered copies: exit 1, exactly the line on stderr, no parameter read, nothing listens', async () => {
      register(FIRST, SECOND);
      const listen = mock.method(net.Server.prototype, 'listen');
      const { edges, record } = recordingEdges(['--version']);
      const result = await main(
        {
          toolSet: fullToolSet,
          program: 'mcp-abap-adt-test',
          version: '9.9.9',
          packageName: '@mcp-abap-adt/test-package',
        },
        edges,
      );
      assert.equal(result, undefined);
      assert.deepEqual(record.exits, [1]);
      assert.deepEqual(record.stderr, [lineFor('@mcp-abap-adt/test-package')]);
      assert.deepEqual(record.stdout, []);
      assert.equal(record.argvReads, 0);
      assert.equal(listen.mock.callCount(), 0);
    });

    it('one registered copy: starts as today (--version answered)', async () => {
      register(FIRST);
      const { edges, record } = recordingEdges(['--version']);
      await main(
        {
          toolSet: fullToolSet,
          program: 'mcp-abap-adt-test',
          version: '9.9.9',
          packageName: '@mcp-abap-adt/test-package',
        },
        edges,
      );
      assert.ok(record.argvReads > 0);
      assert.deepEqual(record.stdout, ['9.9.9']);
      assert.deepEqual(record.stderr, []);
      assert.deepEqual(record.exits, [0]);
    });
  });
}

/**
 * Each binary names ITS package: the nine wrappers are called here; the
 * three plain bins (`server`, `http`, `sse`) pass their version module's
 * name, checked against their own manifest.
 *
 * The other packages' modules are required at run time: this package's
 * checker (`server-runtime/tsconfig.test.json`) resolves none of their
 * package names. The test build compiles each of them
 * (`tsconfig.node-test.json`, `include`).
 */
const ROOT = repositoryRoot(__dirname);
const manifestName = (dir: string): string =>
  JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')).name;

describe('each binary passes its own package name', () => {
  const wrappers: ReadonlyArray<
    readonly [string, (edges: LauncherEdges) => Promise<unknown>]
  > = [
    ['compact', require('../../../compact/src/launcher').main],
    ['compact-http', require('../../../compact-http/src/launcher').main],
    ['compact-sse', require('../../../compact-sse/src/launcher').main],
    ['core-ro', require('../../../core-ro/src/launcher').main],
    ['http-ro', require('../../../http-ro/src/launcher').main],
    ['sse-ro', require('../../../sse-ro/src/launcher').main],
    ['compact-ro', require('../../../compact-ro/src/launcher').main],
    ['compact-http-ro', require('../../../compact-http-ro/src/launcher').main],
    ['compact-sse-ro', require('../../../compact-sse-ro/src/launcher').main],
  ];

  for (const [dir, main] of wrappers) {
    it(dir, async () => {
      register(FIRST, SECOND);
      // `--version`: a wrapper that skipped the guard answers it and exits 0.
      const { edges, record } = recordingEdges(['--version']);
      await main(edges);
      assert.deepEqual(record.exits, [1]);
      assert.deepEqual(record.stderr, [lineFor(manifestName(dir))]);
    });
  }

  for (const [dir, read] of [
    ['server', () => require('../../../server/src/coreVersion').CORE_PACKAGE],
    ['http', () => require('../../../http/src/httpVersion').HTTP_PACKAGE],
    ['sse', () => require('../../../sse/src/sseVersion').SSE_PACKAGE],
  ] as const) {
    it(`${dir}'s version module names its manifest's package`, () => {
      assert.equal(read(), manifestName(dir));
    });
  }

  for (const [dir, bin, constant] of [
    ['server', 'mcp-abap-adt.js', 'CORE_PACKAGE'],
    ['http', 'mcp-abap-adt-http.js', 'HTTP_PACKAGE'],
    ['sse', 'mcp-abap-adt-sse.js', 'SSE_PACKAGE'],
  ] as const) {
    it(`${dir}'s bin passes it`, () => {
      const source = readFileSync(join(ROOT, dir, 'bin', bin), 'utf8');
      assert.ok(source.includes(`packageName: ${constant},`));
    });
  }
});

/**
 * The old launcher paths take 19.1.0's options: `main({ toolSet, program,
 * version })` with no `packageName` names the path's own package in the line;
 * a `packageName` given passes through.
 */
describe("the old launcher paths: 19.1.0's options, the path's own package", () => {
  const oldPaths: ReadonlyArray<
    readonly [
      string,
      string,
      (
        options: {
          toolSet: typeof fullToolSet;
          program: string;
          version: string;
          packageName?: string;
        },
        edges: LauncherEdges,
      ) => Promise<unknown>,
    ]
  > = [
    [
      '@mcp-abap-adt/core/launcher',
      'server',
      require('../../../server/src/launcher').main,
    ],
    [
      '@mcp-abap-adt/http/launcher',
      'http',
      require('../../../http/src/launcher').main,
    ],
    [
      '@mcp-abap-adt/sse/launcher',
      'sse',
      require('../../../sse/src/launcher').main,
    ],
  ];

  for (const [modulePath, dir, main] of oldPaths) {
    it(`${modulePath} without packageName: the line names its own package`, async () => {
      register(FIRST, SECOND);
      const { edges, record } = recordingEdges(['--version']);
      await main(
        {
          toolSet: fullToolSet,
          program: 'mcp-abap-adt-test',
          version: '9.9.9',
        },
        edges,
      );
      assert.deepEqual(record.exits, [1]);
      assert.deepEqual(record.stderr, [lineFor(manifestName(dir))]);
      // The path's own package: `@mcp-abap-adt/core`, `/http`, `/sse`.
      assert.ok(
        record.stderr[0]?.includes(
          `reinstall ${modulePath.split('/launcher')[0]} `,
        ),
      );
    });
  }

  for (const [modulePath, , main] of oldPaths) {
    it(`${modulePath} with packageName: that package`, async () => {
      register(FIRST, SECOND);
      const { edges, record } = recordingEdges(['--version']);
      await main(
        {
          toolSet: fullToolSet,
          program: 'mcp-abap-adt-test',
          version: '9.9.9',
          packageName: '@mcp-abap-adt/test-package',
        },
        edges,
      );
      assert.deepEqual(record.stderr, [lineFor('@mcp-abap-adt/test-package')]);
    });
  }
});
