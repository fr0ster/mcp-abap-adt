/**
 * `mcp-abap-adt-compact-http`: the compact tool set over Streamable HTTP (http's launcher), and this package's own name and
 * version — nothing else (D49). The behaviour beside the full binary is
 * `src/__tests__/parity/toolSetParity.test.ts`'s.
 */

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compactToolSet, main } from '../launcher';

const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as { name: string; version: string };

/** `main` with the given arguments; the start is expected to stop. */
async function stopped(argv: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exits: number[] = [];
  await main({
    argv,
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    exit: (code) => exits.push(code),
    processLike: Object.assign(new EventEmitter(), {
      stdin: new EventEmitter(),
    }),
  });
  return { stdout, stderr, exits };
}

describe('mcp-abap-adt-compact-http', () => {
  it('answers this package’s version, on stdout', async () => {
    expect(await stopped(['--version'])).toEqual({
      stdout: [manifest.version],
      stderr: [],
      exits: [0],
    });
  });

  it('names itself in USAGE, and lists the compact exposition', async () => {
    const { stderr, exits } = await stopped(['--help']);
    expect(exits).toEqual([0]);
    expect(stderr.join('\n')).toContain(
      'USAGE:\n  mcp-abap-adt-compact-http [options]',
    );
    expect(stderr.join('\n')).toContain('--exposition=<ro|rw>[,debug]');
  });

  it('serves the compact tool set: rw by default, 27 tools, the three background-run tools and the three leftover-session tools', () => {
    const exposition = compactToolSet.exposition(undefined, [], 'stdio');
    expect(exposition).toEqual(['rw']);
    const tools = compactToolSet
      .groups({ connection: undefined as never, logger: undefined }, exposition)
      .flatMap((group) => group.getHandlers());
    expect(tools).toHaveLength(33);
  });
});
