/**
 * D24 / §14.6: across a refused token request (a secret marker in the
 * server's `error_description`) and a successful login, nothing a secret is
 * made of leaves the process by any way out — stderr, the logger, a tool
 * result, the callback listener's HTTP answers: no marker, client secret,
 * token, `state=`, authorization URL or `code=`. stdout stays empty under
 * stdio. With `--auth-debug` the secret's prepared form (its first and last
 * four characters) is on stderr, and only there.
 */

import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { type Stand, stand } from '../helpers/loginStand';

jest.setTimeout(60_000);

const MARKER = 'description-marker-5d2e8b17c9';
const CLIENT_SECRET = 'cs-0123456789-abcdefghij-ZZ';
/** `prepareSecret` under authDebug: the first four, an ellipsis, the last four. */
const PREPARED = 'cs-0…j-ZZ';

let s: Stand;
let stdout: string[];
let stdoutSpy: jest.SpyInstance;
let loggerLines: string[];

/** What `--auth-debug` makes the launcher's logger: every line to stderr. */
const stderrLogger = (): ILogger => {
  const write = (line: unknown, meta?: unknown) => {
    const text = `${String(line)}${meta === undefined ? '' : ` ${JSON.stringify(meta)}`}`;
    loggerLines.push(text);
    process.stderr.write(`${text}\n`);
  };
  return { info: write, warn: write, error: write, debug: write };
};

beforeEach(() => {
  stdout = [];
  loggerLines = [];
  stdoutSpy = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
});

afterEach(async () => {
  await s?.close();
  stdoutSpy.mockRestore();
});

/** Every surface a secret could leave by, as text. */
const surfaces = (results: string[]) => ({
  stderr: s.stderr.join(''),
  logger: loggerLines.join('\n'),
  results: results.join('\n'),
  http: s.browser.answers.join('\n'),
});

const secretsOf = () => [
  MARKER,
  CLIENT_SECRET,
  'the-code',
  'code=',
  'state=',
  ...s.browser.urls,
  ...s.tokens.issued,
];

function expectNoSecret(where: string, text: string, secrets = secretsOf()) {
  for (const secret of secrets) {
    if (text.includes(secret)) {
      throw new Error(`${where} holds a secret: ${secret.slice(0, 6)}…`);
    }
  }
}

describe('a refused token request', () => {
  it('no marker, secret, state, code or URL on any surface; stdout empty', async () => {
    s = await stand({ auth: 'jwt', clientSecret: CLIENT_SECRET });
    s.tokens.refuseCodes(MARKER);
    const answer = await s.callTool('ProbeAdt', { id: 'REFUSED' });
    expect(answer).not.toBe('cancelled');
    expect(s.browser.urls).toHaveLength(1);
    expect((answer as { isError: boolean }).isError).toBe(true);
    const where = surfaces([(answer as { text: string }).text]);
    for (const [name, text] of Object.entries(where)) {
      expectNoSecret(name, text);
    }
    expect(stdout.join('')).toBe('');
  });

  it('--auth-debug: the prepared form on stderr, nowhere else; never the secret or the marker', async () => {
    s = await stand({
      auth: 'jwt',
      clientSecret: CLIENT_SECRET,
      authDebug: true,
      logger: stderrLogger(),
    });
    s.tokens.refuseCodes(MARKER);
    const answer = await s.callTool('ProbeAdt', { id: 'REFUSED' });
    const text = (answer as { text: string }).text;
    const where = surfaces([text]);
    expect(where.stderr).toContain(PREPARED);
    expect(where.results).not.toContain(PREPARED);
    expect(where.http).not.toContain(PREPARED);
    for (const [name, surface] of Object.entries(where)) {
      expectNoSecret(name, surface);
    }
    expect(stdout.join('')).toBe('');
  });
});

describe('a successful login', () => {
  it('no token, secret, state, code or URL on any surface; stdout empty', async () => {
    s = await stand({ auth: 'jwt', clientSecret: CLIENT_SECRET });
    const answer = await s.callTool('ProbeAdt', { id: 'OK' });
    expect((answer as { isError: boolean }).isError).toBe(false);
    expect(s.tokens.issued.length).toBeGreaterThan(0);
    const where = surfaces([(answer as { text: string }).text]);
    for (const [name, text] of Object.entries(where)) {
      expectNoSecret(name, text);
    }
    expect(stdout.join('')).toBe('');
  });

  it('--auth-debug: still no token, code, state or URL; stdout empty', async () => {
    s = await stand({
      auth: 'jwt',
      clientSecret: CLIENT_SECRET,
      authDebug: true,
      logger: stderrLogger(),
    });
    const answer = await s.callTool('ProbeAdt', { id: 'OK' });
    expect((answer as { isError: boolean }).isError).toBe(false);
    const where = surfaces([(answer as { text: string }).text]);
    for (const [name, text] of Object.entries(where)) {
      expectNoSecret(name, text, [
        MARKER,
        CLIENT_SECRET,
        'the-code',
        'code=',
        'state=',
        ...s.browser.urls,
        ...s.tokens.issued,
      ]);
    }
    expect(stdout.join('')).toBe('');
  });
});
