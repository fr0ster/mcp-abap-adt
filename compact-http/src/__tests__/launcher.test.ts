/**
 * `mcp-abap-adt-compact-http`: the compact tool set over Streamable HTTP (http's launcher), and this package's own name and
 * version — nothing else. The behaviour beside the full binary is
 * `src/__tests__/parity/toolSetParity.test.ts`'s.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
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
    assert.deepStrictEqual(await stopped(['--version']), {
      stdout: [manifest.version],
      stderr: [],
      exits: [0],
    });
  });

  it('names itself in USAGE, and lists its tools, not an exposition', async () => {
    const { stderr, exits } = await stopped(['--help']);
    assert.deepStrictEqual(exits, [0]);
    assert.ok(
      stderr
        .join('\n')
        .includes('USAGE:\n  mcp-abap-adt-compact-http [options]'),
    );
    assert.ok(
      stderr
        .join('\n')
        .includes(
          '\nTOOLS:\n  mcp-abap-adt-compact-http serves one fixed tool set',
        ),
    );
    assert.ok(!stderr.join('\n').includes('--exposition=<'));
  });

  it("serves the compact tool set without the data tool: 26 of the 27 tools, the two abapGit tools, the four debugger tools, HandlerDebugBatch, the three background-run tools, HandlerBatch and HandlerSession — no leftover-session tool, which is stdio's", () => {
    const tools = compactToolSet
      .groups({ connection: undefined as never, logger: undefined }, 'http', {
        dataTools: false,
      })
      .flatMap((group) => group.getHandlers());
    assert.equal(tools.length, 38);
    assert.equal(
      tools.filter((entry) => entry.toolDefinition.name === 'HandlerSession')
        .length,
      1,
    );
    assert.deepStrictEqual(
      tools
        .map((entry) => entry.toolDefinition.name)
        .filter((name) => name.includes('LeftoverSession')),
      [],
    );
  });

  it('stops on --exposition, naming the binary its words ask for', async () => {
    assert.deepStrictEqual(await stopped(['--exposition=ro']), {
      stdout: [],
      stderr: [
        `[MCP] --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the compact tools that change nothing are served by \`mcp-abap-adt-compact-http-ro\` (\`@mcp-abap-adt/compact-http-ro\`)`,
      ],
      exits: [1],
    });
  });
});
