/**
 * Across a refused token request (a secret marker in the
 * server's `error_description`) and a successful login, nothing a secret is
 * made of leaves the process by any way out — stderr, the logger, a tool
 * result, the callback listener's HTTP answers: no marker, client secret,
 * token, `state=`, authorization URL or `code=`. stdout stays empty under
 * stdio. With `--auth-debug` the secret's prepared form (its first and last
 * four characters) is on stderr, and only there.
 *
 * Each case runs its login stand in a process of its own
 * (`scenarios/noSecretsOut.scenario.ts`), and this file is the client that
 * owns that process's stdout and stderr: nothing but the scenario's one
 * report line may reach stdout, and no secret may reach stderr — the
 * process's own, besides every surface the stand captured. A spy on this
 * process's stdout would sit between node:test's runner and its report
 * (Task 3.1, measured), so stdout is read from the outside instead.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  killScenarioChildren,
  runScenarioOutput,
  type ScenarioOutput,
} from '../../../../../src/__tests__/helpers/scenarioOutput';

const SCENARIO =
  'server-runtime/src/stdio/__tests__/debug/scenarios/noSecretsOut.scenario.ts';
const MARKER = 'description-marker-5d2e8b17c9';
const CLIENT_SECRET = 'cs-0123456789-abcdefghij-ZZ';
/** `prepareSecret` under authDebug: the first four, an ellipsis, the last four. */
const PREPARED = 'cs-0…j-ZZ';

afterEach(() => killScenarioChildren());

/** The scenario's report, read as data from outside the type system. */
interface Seen {
  answer: unknown;
  urls: string[];
  issued: string[];
  /** stderr as the stand captured it, its logger's lines among them. */
  stderr: string;
  logger: string;
  http: string;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/**
 * Runs one case as its client: the child ends with 0, its stdout holds its
 * report line and nothing else, and the report is read.
 */
async function run(
  which: string,
): Promise<{ seen: Seen; out: ScenarioOutput }> {
  const out = await runScenarioOutput(SCENARIO, [which]);
  assert.equal(out.code, 0, out.stderr);
  const lines = out.stdout.split('\n').filter((line) => line !== '');
  // stdout empty under stdio: the report is the only line on it.
  assert.equal(
    lines.length,
    1,
    `stdout carried more than the report: ${lines.length} lines`,
  );
  const parsed: unknown = JSON.parse(lines[0] ?? '');
  const field = (key: string): unknown =>
    typeof parsed === 'object' && parsed !== null && key in parsed
      ? Reflect.get(parsed, key)
      : undefined;
  // The child saw no unhandled rejection (the recorder's list).
  assert.deepStrictEqual(field('unhandled'), []);
  return {
    seen: {
      answer: field('answer'),
      urls: strings(field('urls')),
      issued: strings(field('issued')),
      stderr: text(field('stderr')),
      logger: text(field('logger')),
      http: text(field('http')),
    },
    out,
  };
}

/** Every surface a secret could leave by, as text: the child's own stderr too. */
const surfaces = (seen: Seen, out: ScenarioOutput, results: string[]) => ({
  stderr: seen.stderr,
  logger: seen.logger,
  results: results.join('\n'),
  http: seen.http,
  'process stderr': out.stderr,
});

const secretsOf = (seen: Seen) => [
  MARKER,
  CLIENT_SECRET,
  'the-code',
  'code=',
  'state=',
  ...seen.urls,
  ...seen.issued,
];

function expectNoSecret(where: string, surface: string, secrets: string[]) {
  for (const secret of secrets) {
    if (surface.includes(secret)) {
      throw new Error(`${where} holds a secret: ${secret.slice(0, 6)}…`);
    }
  }
}

/** The answer's field, when the answer is a tool answer (not 'cancelled'). */
const answerField = (answer: unknown, key: string): unknown =>
  typeof answer === 'object' && answer !== null && key in answer
    ? Reflect.get(answer, key)
    : undefined;

describe('a refused token request', () => {
  it('no marker, secret, state, code or URL on any surface; stdout empty', async () => {
    const { seen, out } = await run('refused');
    assert.notEqual(seen.answer, 'cancelled');
    assert.equal(seen.urls.length, 1);
    assert.equal(answerField(seen.answer, 'isError'), true);
    const where = surfaces(seen, out, [text(answerField(seen.answer, 'text'))]);
    for (const [name, surface] of Object.entries(where)) {
      expectNoSecret(name, surface, secretsOf(seen));
    }
  });

  it('--auth-debug: the prepared form on stderr, nowhere else; never the secret or the marker', async () => {
    const { seen, out } = await run('refused-debug');
    const where = surfaces(seen, out, [text(answerField(seen.answer, 'text'))]);
    assert.ok(where.stderr.includes(PREPARED));
    assert.ok(!where.results.includes(PREPARED));
    assert.ok(!where.http.includes(PREPARED));
    for (const [name, surface] of Object.entries(where)) {
      expectNoSecret(name, surface, secretsOf(seen));
    }
  });
});

describe('a successful login', () => {
  it('no token, secret, state, code or URL on any surface; stdout empty', async () => {
    const { seen, out } = await run('login');
    assert.equal(answerField(seen.answer, 'isError'), false);
    assert.ok(seen.issued.length > 0);
    const where = surfaces(seen, out, [text(answerField(seen.answer, 'text'))]);
    for (const [name, surface] of Object.entries(where)) {
      expectNoSecret(name, surface, secretsOf(seen));
    }
  });

  it('--auth-debug: still no token, code, state or URL; stdout empty', async () => {
    const { seen, out } = await run('login-debug');
    assert.equal(answerField(seen.answer, 'isError'), false);
    const where = surfaces(seen, out, [text(answerField(seen.answer, 'text'))]);
    for (const [name, surface] of Object.entries(where)) {
      expectNoSecret(name, surface, secretsOf(seen));
    }
  });
});
