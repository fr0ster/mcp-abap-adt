/**
 * Who a request's state belongs to (spec D15): a handle is no key, so the
 * owner is proven by the request's own credentials — the destination, an HMAC
 * of a basic login, or the SAP user SAP answers on a token. Never a claim.
 */

import type { IDestinations } from '@mcp-abap-adt/lib/auth';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

const stubDestinations: IDestinations = {
  settingsFor: jest.fn(),
  getProvider: jest.fn(),
};

const URL = 'https://sap.invalid';
const silent = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

/** An unsigned token whose payload claims a user; nothing reads it as one. */
const tokenClaiming = (user: string, nonce: string) =>
  [
    Buffer.from('{"alg":"none"}').toString('base64url'),
    Buffer.from(JSON.stringify({ user_name: user, nonce })).toString(
      'base64url',
    ),
    '',
  ].join('.');

function make(
  connectedUser?: (h: Record<string, unknown>) => Promise<string | undefined>,
) {
  const server = new StreamableHttpServer(
    new CompositeHandlersRegistry([]),
    stubDestinations,
    { host: '127.0.0.1', port: 0, logger: silent as never, connectedUser },
  );
  return (
    headers: Record<string, string>,
    destination?: string,
  ): Promise<string | null> =>
    (
      server as unknown as {
        ownerOf: (h: unknown, d?: string) => Promise<string | null>;
      }
    ).ownerOf(headers, destination);
}

const basic = (login: string, password: string) => ({
  'x-sap-url': URL,
  'x-sap-client': '100',
  'x-sap-login': login,
  'x-sap-password': password,
});
const bearer = (token: string) => ({
  'x-sap-url': URL,
  'x-sap-client': '100',
  'x-sap-jwt-token': token,
});

describe('StreamableHttpServer.ownerOf', () => {
  let spies: jest.SpyInstance[];
  beforeEach(() => {
    spies = (['error', 'log', 'warn', 'info', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    );
    for (const f of Object.values(silent)) f.mockClear();
  });
  afterEach(() => {
    // Nothing is logged: no credential, token, user or owner reaches a log line.
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    for (const f of Object.values(silent)) expect(f).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('a destination request is owned by its destination; a request with no identity by nobody', async () => {
    const ownerOf = make();
    expect(await ownerOf({}, 'DEST01')).toBe('dest:DEST01');
    expect(await ownerOf({})).toBeNull();
    expect(await ownerOf({ 'x-sap-url': URL })).toBeNull();
  });

  it('basic: the same login with another password is another owner; the secret never shows', async () => {
    const ownerOf = make();
    const a = await ownerOf(basic('SAPUSER01', 'secret-one'));
    const again = await ownerOf(basic('SAPUSER01', 'secret-one'));
    const other = await ownerOf(basic('SAPUSER01', 'secret-two'));
    expect(a).toMatch(/^basic:[0-9a-f]{64}$/);
    expect(again).toBe(a);
    expect(other).not.toBe(a);
    expect(a).not.toContain('secret-one');
    expect(a).not.toContain('SAPUSER01');
  });

  it('basic: another process (another secret) gives another owner for the same credentials', async () => {
    expect(await make()(basic('SAPUSER01', 'p'))).not.toBe(
      await make()(basic('SAPUSER01', 'p')),
    );
  });

  it('two tokens for which SAP answers the same user are one owner; each token is asked once', async () => {
    const connectedUser = jest.fn(async () => 'SAPUSER01');
    const ownerOf = make(connectedUser);
    const first = await ownerOf(bearer(tokenClaiming('SAPUSER01', 'a')));
    const refreshed = await ownerOf(bearer(tokenClaiming('SAPUSER01', 'b')));
    const firstAgain = await ownerOf(bearer(tokenClaiming('SAPUSER01', 'a')));
    expect(first).toBe(refreshed);
    expect(firstAgain).toBe(first);
    expect(first).toContain('SAPUSER01');
    expect(first?.startsWith('user:')).toBe(true);
    expect(connectedUser).toHaveBeenCalledTimes(2);
  });

  it('the owner is the user SAP answers, not the one the token claims', async () => {
    const ownerOf = make(async () => 'SAPUSER02');
    const owner = await ownerOf(bearer(tokenClaiming('SAPUSER01', 'a')));
    expect(owner).toContain('SAPUSER02');
    expect(owner).not.toContain('SAPUSER01');
  });

  it('a token whose claimed user SAP does not answer gives no owner — refused or unnamed — and is asked again next time', async () => {
    const refusing = jest.fn(async () => {
      throw new Error('401 Unauthorized');
    });
    const ownerOf = make(refusing);
    const token = tokenClaiming('SAPUSER01', 'a');
    expect(await ownerOf(bearer(token))).toBeNull();
    expect(await ownerOf(bearer(token))).toBeNull();
    expect(refusing).toHaveBeenCalledTimes(2);
    expect(await make(async () => undefined)(bearer(token))).toBeNull();
  });

  it('concurrent requests with one token ask SAP once', async () => {
    let answer!: (u: string) => void;
    const connectedUser = jest.fn(
      () =>
        new Promise<string>((r) => {
          answer = r;
        }),
    );
    const ownerOf = make(connectedUser);
    const token = tokenClaiming('SAPUSER01', 'a');
    const both = Promise.all([ownerOf(bearer(token)), ownerOf(bearer(token))]);
    await new Promise((r) => setImmediate(r));
    answer('SAPUSER01');
    const [x, y] = await both;
    expect(x).toBe(y);
    expect(connectedUser).toHaveBeenCalledTimes(1);
  });
});
