/**
 * `mcp-abap-adt-http-ro`: the read-only tool set over Streamable HTTP (http's launcher), and
 * this package's own name and version — nothing else (C23): the readonly tools (with system and search) — no leftover-session tool, which is stdio's.
 * The behaviour beside the write binary is
 * `src/__tests__/parity/toolSetParity.test.ts`'s.
 */

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fullReadOnlyToolSet } from '@mcp-abap-adt/lib/tool-set';
import { main, readOnlyToolSet } from '../launcher';

const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as { name: string; version: string; bin: Record<string, string> };

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

const shape = (set: typeof readOnlyToolSet) =>
  set
    .groups({ connection: undefined as never, logger: undefined }, 'http')
    .map((group) => ({
      group: group.getName(),
      tools: group.getHandlers().map((entry) => entry.toolDefinition.name),
    }));

describe('mcp-abap-adt-http-ro', () => {
  it('is @mcp-abap-adt/http-ro, and its bin is mcp-abap-adt-http-ro', () => {
    expect(manifest.name).toBe('@mcp-abap-adt/http-ro');
    expect(manifest.bin).toEqual({
      'mcp-abap-adt-http-ro': './bin/mcp-abap-adt-http-ro.js',
    });
  });

  it('answers this package’s version, on stdout', async () => {
    expect(await stopped(['--version'])).toEqual({
      stdout: [manifest.version],
      stderr: [],
      exits: [0],
    });
  });

  it('names itself in USAGE, and lists its tools, not an exposition', async () => {
    const { stderr, exits } = await stopped(['--help']);
    expect(exits).toEqual([0]);
    expect(stderr.join('\n')).toContain(
      'USAGE:\n  mcp-abap-adt-http-ro [options]',
    );
    expect(stderr.join('\n')).toContain(
      '\nTOOLS:\n  mcp-abap-adt-http-ro serves one fixed tool set',
    );
    expect(stderr.join('\n')).not.toContain('--exposition=<');
  });

  it('serves the read-only set: 66 tools, none of a background run or a leftover session', () => {
    expect(shape(readOnlyToolSet)).toEqual(shape(fullReadOnlyToolSet));
    expect(shape(readOnlyToolSet).flatMap((g) => g.tools)).toHaveLength(66);
    expect(readOnlyToolSet.backgroundRuns).toBe(false);
    // The leftover-session tools are stdio's (fix round 14).
    expect(
      shape(readOnlyToolSet)
        .flatMap((g) => g.tools)
        .filter((name) => name.includes('LeftoverSession')),
    ).toEqual([]);
  });

  it('stops on --exposition, naming the write binary its words ask for', async () => {
    expect(await stopped(['--exposition=high'])).toEqual({
      stdout: [],
      stderr: [
        `[MCP] --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the high tools are served, beside the readonly ones, by \`mcp-abap-adt-http\` (\`@mcp-abap-adt/http\`)`,
      ],
      exits: [1],
    });
  });
});
