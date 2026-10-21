/**
 * `mcp-abap-adt-compact-sse`: the compact tool set over SSE (sse's launcher), and this package's own name and
 * version — nothing else. The behaviour beside the full binary is
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

describe('mcp-abap-adt-compact-sse', () => {
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
      'USAGE:\n  mcp-abap-adt-compact-sse [options]',
    );
    expect(stderr.join('\n')).toContain(
      '\nTOOLS:\n  mcp-abap-adt-compact-sse serves one fixed tool set',
    );
    expect(stderr.join('\n')).not.toContain('--exposition=<');
  });

  it("serves the compact tool set: the 29 tools, the four debugger tools, HandlerDebugBatch, the three background-run tools and HandlerBatch — no leftover-session tool, which is stdio's", () => {
    const tools = compactToolSet
      .groups({ connection: undefined as never, logger: undefined }, 'sse')
      .flatMap((group) => group.getHandlers());
    expect(tools).toHaveLength(38);
    expect(
      tools
        .map((entry) => entry.toolDefinition.name)
        .filter((name) => name.includes('LeftoverSession')),
    ).toEqual([]);
  });

  it('stops on --exposition, naming the binary its words ask for', async () => {
    expect(await stopped(['--exposition=ro'])).toEqual({
      stdout: [],
      stderr: [
        `[MCP] --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the compact tools that change nothing are served by \`mcp-abap-adt-compact-sse-ro\` (\`@mcp-abap-adt/compact-sse-ro\`)`,
      ],
      exits: [1],
    });
  });
});
