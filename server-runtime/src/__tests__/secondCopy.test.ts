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
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import type { LauncherEdges, LibInstance } from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
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
  jest.restoreAllMocks();
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
    expect(secondCopyLine([FIRST], '@mcp-abap-adt/core')).toBe(undefined);
  });

  it('no entry (a process that loaded no lib cannot ask): undefined, as one', () => {
    expect(secondCopyLine([], '@mcp-abap-adt/core')).toBe(undefined);
  });

  it('two entries: the line, verbatim, naming both copies and the package', () => {
    expect(secondCopyLine([FIRST, SECOND], '@mcp-abap-adt/http')).toBe(
      lineFor('@mcp-abap-adt/http'),
    );
  });

  it('three entries: the first two copies', () => {
    expect(secondCopyLine([FIRST, SECOND, THIRD], '@mcp-abap-adt/sse')).toBe(
      lineFor('@mcp-abap-adt/sse'),
    );
  });

  it('a copy before 24.0.0 is named in fixed words, never by its file', () => {
    const line = secondCopyLine([EARLIER, FIRST], '@mcp-abap-adt/core');
    expect(line).toBe(
      lineFor('@mcp-abap-adt/core', 'a copy before 24.0.0', '24.0.0 dist'),
    );
    expect(line).not.toContain(EARLIER_FILE);
  });
});

describe.each(TRANSPORTS)("%s's main", (_name, main) => {
  it('two registered copies: exit 1, exactly the line on stderr, no parameter read, nothing listens', async () => {
    register(FIRST, SECOND);
    const listen = jest.spyOn(net.Server.prototype, 'listen');
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
    expect(result).toBe(undefined);
    expect(record.exits).toEqual([1]);
    expect(record.stderr).toEqual([lineFor('@mcp-abap-adt/test-package')]);
    expect(record.stdout).toEqual([]);
    expect(record.argvReads).toBe(0);
    expect(listen).not.toHaveBeenCalled();
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
    expect(record.argvReads).toBeGreaterThan(0);
    expect(record.stdout).toEqual(['9.9.9']);
    expect(record.stderr).toEqual([]);
    expect(record.exits).toEqual([0]);
  });
});

/**
 * Each binary names ITS package: the nine wrappers are called here; the
 * three plain bins (`server`, `http`, `sse`) pass their version module's
 * name, checked against their own manifest.
 */
const ROOT = join(__dirname, '..', '..', '..');
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

  it.each(wrappers)('%s', async (dir, main) => {
    register(FIRST, SECOND);
    // `--version`: a wrapper that skipped the guard answers it and exits 0.
    const { edges, record } = recordingEdges(['--version']);
    await main(edges);
    expect(record.exits).toEqual([1]);
    expect(record.stderr).toEqual([lineFor(manifestName(dir))]);
  });

  it.each([
    ['server', () => require('../../../server/src/coreVersion').CORE_PACKAGE],
    ['http', () => require('../../../http/src/httpVersion').HTTP_PACKAGE],
    ['sse', () => require('../../../sse/src/sseVersion').SSE_PACKAGE],
  ] as const)(
    "%s's version module names its manifest's package",
    (dir, read) => {
      expect(read()).toBe(manifestName(dir));
    },
  );

  it.each([
    ['server', 'mcp-abap-adt.js', 'CORE_PACKAGE'],
    ['http', 'mcp-abap-adt-http.js', 'HTTP_PACKAGE'],
    ['sse', 'mcp-abap-adt-sse.js', 'SSE_PACKAGE'],
  ] as const)("%s's bin passes it", (dir, bin, constant) => {
    const source = readFileSync(join(ROOT, dir, 'bin', bin), 'utf8');
    expect(source).toContain(`packageName: ${constant},`);
  });
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
          toolSet: unknown;
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

  it.each(oldPaths)(
    '%s without packageName: the line names its own package',
    async (modulePath, dir, main) => {
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
      expect(record.exits).toEqual([1]);
      expect(record.stderr).toEqual([lineFor(manifestName(dir))]);
      // The path's own package: `@mcp-abap-adt/core`, `/http`, `/sse`.
      expect(record.stderr[0]).toContain(
        `reinstall ${modulePath.split('/launcher')[0]} `,
      );
    },
  );

  it.each(oldPaths)(
    '%s with packageName: that package',
    async (_path, _dir, main) => {
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
      expect(record.stderr).toEqual([lineFor('@mcp-abap-adt/test-package')]);
    },
  );
});
