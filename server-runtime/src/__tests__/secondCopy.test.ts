/**
 * The runtime refuses a second copy of `@mcp-abap-adt/lib` at start.
 *
 * Each loaded copy of lib registers one `{ file }` on a process-wide array;
 * each transport's `main` reads it first — before `--version`, before any
 * parameter, before anything listens — and with more than one entry stops
 * with exit `1` and one line on stderr naming the first two files and the
 * package to reinstall. One entry starts as today.
 */
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import type { LauncherEdges } from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main as httpMain } from '../http/launcher';
import { secondCopyLine } from '../secondCopy';
import { main as sseMain } from '../sse/launcher';
import { main as stdioMain } from '../stdio/launcher';

const REGISTRY = Symbol.for('@mcp-abap-adt/lib/instances');
const holder = globalThis as Record<symbol, unknown>;

const FIRST = '/global/a/node_modules/@mcp-abap-adt/lib/dist/lib/instance.js';
const SECOND = '/global/b/node_modules/@mcp-abap-adt/lib/dist/lib/instance.js';
const THIRD = '/global/c/node_modules/@mcp-abap-adt/lib/dist/lib/instance.js';

const lineFor = (pkg: string, a = FIRST, b = SECOND) =>
  `Two copies of @mcp-abap-adt/lib are loaded in this process (${a}, ${b}): reinstall ${pkg} (npm install -g ${pkg}).`;

let saved: unknown;
beforeEach(() => {
  saved = holder[REGISTRY];
});
afterEach(() => {
  holder[REGISTRY] = saved;
  jest.restoreAllMocks();
});

function register(...files: string[]): void {
  holder[REGISTRY] = files.map((file) => Object.freeze({ file }));
}

/** Edges that record every line and exit, and count each read of `argv`. */
function recordingEdges(argv: string[] = []) {
  const record = {
    stdout: [] as string[],
    stderr: [] as string[],
    exits: [] as number[],
    argvReads: 0,
  };
  const edges: LauncherEdges = {
    get argv() {
      record.argvReads += 1;
      return argv;
    },
    stdout: (line) => record.stdout.push(line),
    stderr: (line) => record.stderr.push(line),
    exit: (code) => record.exits.push(code),
    processLike: new (require('node:events').EventEmitter)(),
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
    expect(secondCopyLine([{ file: FIRST }], '@mcp-abap-adt/core')).toBe(
      undefined,
    );
  });

  it('no entry (a process that loaded no lib cannot ask): undefined, as one', () => {
    expect(secondCopyLine([], '@mcp-abap-adt/core')).toBe(undefined);
  });

  it('two entries: the line, verbatim, naming both files and the package', () => {
    expect(
      secondCopyLine([{ file: FIRST }, { file: SECOND }], '@mcp-abap-adt/http'),
    ).toBe(lineFor('@mcp-abap-adt/http'));
  });

  it('three entries: the first two files', () => {
    expect(
      secondCopyLine(
        [{ file: FIRST }, { file: SECOND }, { file: THIRD }],
        '@mcp-abap-adt/sse',
      ),
    ).toBe(lineFor('@mcp-abap-adt/sse'));
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
