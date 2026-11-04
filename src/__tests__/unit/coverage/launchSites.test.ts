/**
 * Every server a live test launches is launched guarded (plan C2 Step 4a,
 * controller ruling): the integration, admin and live suites reach a child
 * only through `testers/hardMode.ts`' guarded launches (`launchStdio`,
 * `launchHttp`, `launchStdioScript`, `launchHttpScript`,
 * `createHardModeClient`). None of their files spawns a process, uses the
 * MCP SDK's `Client` (it arms a request timer) or its stdio transport, or
 * reaches the launcher's unguarded primitive `startChild` — read here as
 * plain text, file by file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const TESTS = path.join(__dirname, '..', '..');
const LAUNCHER = path.join(
  TESTS,
  'integration',
  'helpers',
  'testers',
  'hardMode.ts',
);

/** Words only the guarded launcher may hold. */
const FORBIDDEN = [
  'node:child_process',
  "'child_process'",
  '@modelcontextprotocol/sdk/client/index.js',
  'StdioClientTransport',
  'startChild',
];

/** Every TypeScript file below `dir`. */
function filesBelow(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(dir, name));
}

/** The forbidden words each file of `files` holds. */
function launchFindings(
  files: readonly string[],
  read: (file: string) => string,
): string[] {
  return files.flatMap((file) =>
    FORBIDDEN.filter((word) => read(file).includes(word)).map(
      (word) => `${path.relative(TESTS, file)}: ${word}`,
    ),
  );
}

describe('launch sites', () => {
  it('no integration, admin or live test file launches a server unguarded', () => {
    const files = ['integration', 'admin', 'live']
      .flatMap((dir) => filesBelow(path.join(TESTS, dir)))
      .filter((file) => file !== LAUNCHER);
    expect(files.length).toBeGreaterThan(0);
    expect(
      launchFindings(files, (file) => fs.readFileSync(file, 'utf8')),
    ).toEqual([]);
  });

  it('a file that spawns, or uses the SDK client, is found', () => {
    const sources: Record<string, string> = {
      'spawns.ts': "import { spawn } from 'node:child_process';",
      'client.ts':
        "import { Client } from '@modelcontextprotocol/sdk/client/index.js';",
      'primitive.ts': "import { startChild } from './testers/hardMode';",
      'clean.ts': "import { launchStdio } from './testers/hardMode';",
    };
    const files = Object.keys(sources).map((name) => path.join(TESTS, name));
    expect(
      launchFindings(files, (file) => sources[path.basename(file)] ?? ''),
    ).toEqual([
      'spawns.ts: node:child_process',
      'client.ts: @modelcontextprotocol/sdk/client/index.js',
      'primitive.ts: startChild',
    ]);
  });
});
