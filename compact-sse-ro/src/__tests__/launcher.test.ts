/**
 * `mcp-abap-adt-compact-sse-ro`: the read-only tool set over HTTP+SSE (sse's launcher), and
 * this package's own name and version — nothing else: the 16 compact tools that change nothing — no leftover-session tool, which is stdio's.
 * The behaviour beside the write binary is
 * `src/__tests__/parity/toolSetParity.test.ts`'s.
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  compactDataEntries,
  compactReadOnlyEntries,
} from '@mcp-abap-adt/compact-readonly-entries';
import { compactReadOnlyToolSetOf } from '@mcp-abap-adt/lib/tool-set';
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
    .groups({ connection: undefined as never, logger: undefined }, 'sse', {
      dataTools: false,
    })
    .map((group) => ({
      group: group.getName(),
      tools: group.getHandlers().map((entry) => entry.toolDefinition.name),
    }));

describe('mcp-abap-adt-compact-sse-ro', () => {
  it('is @mcp-abap-adt/compact-sse-ro, and its bin is mcp-abap-adt-compact-sse-ro', () => {
    assert.equal(manifest.name, '@mcp-abap-adt/compact-sse-ro');
    assert.deepStrictEqual(manifest.bin, {
      'mcp-abap-adt-compact-sse-ro': './bin/mcp-abap-adt-compact-sse-ro.js',
    });
  });

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
        .includes('USAGE:\n  mcp-abap-adt-compact-sse-ro [options]'),
    );
    assert.ok(
      stderr
        .join('\n')
        .includes(
          '\nTOOLS:\n  mcp-abap-adt-compact-sse-ro serves one fixed tool set',
        ),
    );
    assert.ok(!stderr.join('\n').includes('--exposition=<'));
  });

  it('serves the read-only set without the data tool: 20 tools (HandlerAbapGitGet, HandlerBatch among them), the background-run tools, none of a leftover session', () => {
    assert.deepStrictEqual(
      shape(readOnlyToolSet),
      shape(
        compactReadOnlyToolSetOf({
          readOnly: compactReadOnlyEntries,
          data: compactDataEntries,
        }),
      ),
    );
    assert.equal(shape(readOnlyToolSet).flatMap((g) => g.tools).length, 20);
    assert.equal(readOnlyToolSet.backgroundRuns, true);
    // The leftover-session tools are stdio's.
    assert.deepStrictEqual(
      shape(readOnlyToolSet)
        .flatMap((g) => g.tools)
        .filter((name) => name.includes('LeftoverSession')),
      [],
    );
  });

  it('stops on --exposition, naming the write binary its words ask for', async () => {
    assert.deepStrictEqual(await stopped(['--exposition=rw']), {
      stdout: [],
      stderr: [
        `[MCP] --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; all compact tools are served by \`mcp-abap-adt-compact-sse\` (\`@mcp-abap-adt/compact-sse\`)`,
      ],
      exits: [1],
    });
  });
});
