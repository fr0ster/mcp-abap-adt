/**
 * The program's shutdown, stdio: every trigger — a signal,
 * or stdin's end (the client closed the transport) — runs one sequence: the
 * latch, the logoffs at once with every running tool interrupted (none
 * awaited), the MCP server's close, then the factory's settle (gate,
 * logins, drain, flush), then the exit code — once, and nothing of it
 * reaches stdout.
 *
 * Each case runs in a process of its own (`shutdown/scenarios/
 * core.scenario.ts`), and this file is the client that owns that process's
 * stdout: the case's record is the one line on it, and nothing of the
 * shutdown is (H3). A spy on this process's stdout would sit between
 * node:test's runner and its report (Task 3.1, measured).
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { format } from 'node:util';
import {
  killScenarioChildren,
  runScenarioOutput,
} from '../../../../src/__tests__/helpers/scenarioOutput';

const SCENARIO =
  'server-runtime/src/stdio/__tests__/shutdown/scenarios/core.scenario.ts';

afterEach(() => killScenarioChildren());

/**
 * One case as the child's client: it exits 0, and its stdout is its one
 * record line — nothing of the shutdown reaches stdout, in any case (H3).
 * Answers a reader of the record's fields (data from outside the types).
 */
async function caseOf(...args: string[]): Promise<(key: string) => unknown> {
  const out = await runScenarioOutput(SCENARIO, args);
  assert.equal(out.code, 0, out.stderr);
  // The diagnostics' stream carries no secret either: the one the cases
  // hold is a settle failure's message.
  assert.ok(!out.stderr.includes('a token'), 'stderr holds a secret');
  // Its bytes are exactly the record line, so a stray byte or newline fails.
  const end = out.stdout.indexOf('\n');
  const record: unknown = JSON.parse(
    end === -1 ? out.stdout : out.stdout.slice(0, end),
  );
  assert.equal(
    out.stdout,
    `${JSON.stringify(record)}\n`,
    "stdout carried more than the case's record",
  );
  return (key) =>
    typeof record === 'object' && record !== null && key in record
      ? Reflect.get(record, key)
      : undefined;
}

describe('installShutdown (core)', () => {
  for (const trigger of ['SIGTERM', 'SIGINT', 'stdin end', 'stdin close']) {
    it(
      format(
        '%s runs the sequence: latch and begin in its tick, the MCP server closed, then settle, exit 0',
        trigger,
      ),
      async () => {
        const fact = await caseOf('sequence', trigger);
        // In the trigger's tick: the latch and the factory's begin.
        assert.equal(fact('latchedInTick'), true);
        assert.deepStrictEqual(fact('orderInTick'), ['begin']);
        assert.deepStrictEqual(fact('order'), [
          'begin',
          'mcp close',
          'settle',
          'settled',
          'exit(0)',
        ]);
        assert.deepStrictEqual(fact('stderr'), []);
      },
    );
  }

  it('stdin end is not a trigger when not asked for', async () => {
    const fact = await caseOf('stdin end not asked for');
    assert.deepStrictEqual(fact('order'), []);
  });

  it('a running tool is interrupted in the trigger’s tick and not awaited: the sequence runs to its exit without it', async () => {
    const fact = await caseOf('running tool');
    assert.equal(fact('abortedInTick'), true);
    assert.deepStrictEqual(fact('order'), [
      'begin',
      'mcp close',
      'settle',
      'settled',
      'exit(0)',
    ]);
  });

  it('notStored: one stderr line per destination, exit 1', async () => {
    const fact = await caseOf('not stored');
    assert.deepStrictEqual(fact('stderr'), [
      '[MCP] Session secrets not stored: "X": StorageError',
      '[MCP] Session secrets not stored: "Y": StorageError',
    ]);
    assert.deepStrictEqual(fact('exits'), [1]);
  });

  it('a settle that throws: its class on stderr, exit 1', async () => {
    const fact = await caseOf('settle throws');
    const stderr = fact('stderr');
    assert.deepStrictEqual(stderr, [
      '[MCP] Shutdown did not settle: FlushTrouble',
    ]);
    assert.ok(Array.isArray(stderr) && !stderr.join('\n').includes('a token'));
    assert.deepStrictEqual(fact('exits'), [1]);
  });

  it('refuses a birth startBirth() did not make, before any trigger is installed', async () => {
    const fact = await caseOf('foreign birth');
    // It throws, and its message holds the words.
    assert.equal(fact('threw'), true);
    const message = fact('message');
    assert.ok(
      typeof message === 'string' &&
        message.includes('installShutdown takes a birth made by startBirth()'),
    );
  });

  it('two calls of run() answer the same run', async () => {
    const fact = await caseOf('run twice');
    assert.equal(fact('settles'), 1);
    assert.deepStrictEqual(fact('exits'), [0]);
  });
});
