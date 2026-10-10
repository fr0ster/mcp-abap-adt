/**
 * The owner of a request's state is a scope — for listing an owner's states
 * and the per-owner limit — taken where it is known for free: the
 * destination, or an HMAC of a basic login. It authorizes nothing: the handle
 * is a bearer secret. A token request has no owner, and no SAP call is made
 * to find one.
 */

const createAbapConnection = jest.fn();
jest.mock('@mcp-abap-adt/lib/utils', () => ({
  ...jest.requireActual('@mcp-abap-adt/lib/utils'),
  createAbapConnection: (...a: unknown[]) => createAbapConnection(...a),
}));

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

function make() {
  const server = new StreamableHttpServer(
    new CompositeHandlersRegistry([]),
    stubDestinations,
    { host: '127.0.0.1', port: 0, logger: silent as never },
  );
  return (headers: Record<string, string>, destination?: string) =>
    (
      server as unknown as {
        ownerOf: (h: unknown, d: string | undefined) => string | null;
      }
    ).ownerOf(headers, destination);
}

const basic = (login: string, password: string) => ({
  'x-sap-url': URL,
  'x-sap-client': '100',
  'x-sap-login': login,
  'x-sap-password': password,
});

describe('StreamableHttpServer.ownerOf', () => {
  let spies: jest.SpyInstance[];
  beforeEach(() => {
    spies = (['error', 'log', 'warn', 'info', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation(() => {}),
    );
    for (const f of Object.values(silent)) f.mockClear();
    createAbapConnection.mockClear();
  });
  afterEach(() => {
    // Nothing is logged: no credential or owner reaches a log line.
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    for (const f of Object.values(silent)) expect(f).not.toHaveBeenCalled();
    // No SAP call is made for ownership.
    expect(createAbapConnection).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('a destination request is scoped by its destination; a request with no identity by nothing', () => {
    const ownerOf = make();
    expect(ownerOf({}, 'DEST01')).toBe('dest:DEST01');
    expect(ownerOf({})).toBeNull();
    expect(ownerOf({ 'x-sap-url': URL })).toBeNull();
  });

  it('basic: the same login with another password is another owner; the secret never shows', () => {
    const ownerOf = make();
    const a = ownerOf(basic('SAPUSER01', 'secret-one'));
    const again = ownerOf(basic('SAPUSER01', 'secret-one'));
    const other = ownerOf(basic('SAPUSER01', 'secret-two'));
    expect(a).toMatch(/^basic:[0-9a-f]{64}$/);
    expect(again).toBe(a);
    expect(other).not.toBe(a);
    expect(a).not.toContain('secret-one');
    expect(a).not.toContain('SAPUSER01');
  });

  it('basic: another process (another secret) gives another owner for the same credentials', () => {
    expect(make()(basic('SAPUSER01', 'p'))).not.toBe(
      make()(basic('SAPUSER01', 'p')),
    );
  });

  it('a token request has no owner, and nothing asks SAP for one', () => {
    const ownerOf = make();
    expect(
      ownerOf({
        'x-sap-url': URL,
        'x-sap-client': '100',
        'x-sap-jwt-token': 'header.payload.signature',
      }),
    ).toBeNull();
  });
});
