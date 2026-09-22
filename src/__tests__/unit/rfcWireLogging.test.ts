import { RfcTransport } from '@mcp-abap-adt/connection';
import { createAbapConnection } from '../../lib/connectionFactory';

/**
 * Whether the RFC wire logs what it carries, and who decides.
 *
 * `@mcp-abap-adt/connection` 8.1.0 added a third constructor argument to
 * `RfcTransport`: with `logWire` it puts the request headers and both bodies
 * on the debug channel, which is the only way to see a payload that was
 * mis-serialised before it reached `SADT_REST_RFC_ENDPOINT`. That question is
 * live — #222 reports `CreatePackage` losing `superPackage` over RFC while the
 * same call succeeds over HTTP, and the investigation stopped exactly here,
 * because the connector logged the method and the URI and nothing else.
 *
 * The switch is an environment variable rather than an argument: it is asked
 * by whoever is sitting in front of a misbehaving system, not by code, and an
 * argument would have to be threaded through every call site for something
 * nobody sets in production.
 */
jest.mock('@mcp-abap-adt/connection', () => ({
  ...jest.requireActual('@mcp-abap-adt/connection'),
  RfcTransport: jest.fn(),
}));

const rfcConfig = {
  url: 'https://example.invalid',
  client: '100',
  connectionType: 'rfc' as const,
  authType: 'basic' as const,
  username: 'SAPUSER01',
  password: 'irrelevant',
  ashost: 'example.invalid',
  sysnr: '00',
};

/** The third argument `RfcTransport` was constructed with. */
const optionsFromLastCall = () =>
  (RfcTransport as unknown as jest.Mock).mock.calls.at(-1)?.[2];

/** The second — the logger, without which the option writes nothing. */
const loggerFromLastCall = () =>
  (RfcTransport as unknown as jest.Mock).mock.calls.at(-1)?.[1];

describe('the RFC wire logs only when asked', () => {
  const saved = {
    wire: process.env.DEBUG_RFC_WIRE,
    chars: process.env.DEBUG_RFC_BODY_CHARS,
  };

  afterEach(() => {
    for (const [name, value] of [
      ['DEBUG_RFC_WIRE', saved.wire],
      ['DEBUG_RFC_BODY_CHARS', saved.chars],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    (RfcTransport as unknown as jest.Mock).mockClear();
  });

  const connect = () =>
    createAbapConnection(rfcConfig as never, undefined, undefined);

  it('stays off when nothing asked for it', () => {
    delete process.env.DEBUG_RFC_WIRE;
    connect();
    expect(optionsFromLastCall()).toEqual({ logWire: false });
  });

  it.each(['true', '1'])('turns on for DEBUG_RFC_WIRE=%s', (value) => {
    process.env.DEBUG_RFC_WIRE = value;
    connect();
    expect(optionsFromLastCall()).toMatchObject({ logWire: true });
  });

  it('stays off for anything else, including "yes" and an empty value', () => {
    for (const value of ['yes', 'on', '', 'false', '0']) {
      process.env.DEBUG_RFC_WIRE = value;
      connect();
      expect(optionsFromLastCall()).toEqual({ logWire: false });
    }
  });

  it('passes the ceiling through, including its two edge values', () => {
    process.env.DEBUG_RFC_WIRE = 'true';

    process.env.DEBUG_RFC_BODY_CHARS = '0';
    connect();
    // Zero is a real answer — the size and none of the bytes — so it must not
    // be treated as "unset".
    expect(optionsFromLastCall()).toEqual({
      logWire: true,
      maxLoggedBodyChars: 0,
    });

    process.env.DEBUG_RFC_BODY_CHARS = 'Infinity';
    connect();
    expect(optionsFromLastCall()).toEqual({
      logWire: true,
      maxLoggedBodyChars: Number.POSITIVE_INFINITY,
    });
  });

  /**
   * **A typo must not fail a connection, and must not silently become a
   * ceiling either.** `Number('lots')` is `NaN`, and what happens to it is the
   * package's decision: `@mcp-abap-adt/connection` compares `asked >= 0`,
   * which `NaN` fails, and falls back to its own default rather than throwing
   * or reaching `slice(0, NaN)`. That behaviour is depended on here, so it is
   * pinned here — if the package ever starts honouring a nonsense ceiling,
   * this is the test that notices.
   */
  it('hands a nonsense ceiling on rather than guessing at it', () => {
    process.env.DEBUG_RFC_WIRE = 'true';
    process.env.DEBUG_RFC_BODY_CHARS = 'lots';
    connect();
    const options = optionsFromLastCall();
    expect(options.logWire).toBe(true);
    expect(Number.isNaN(options.maxLoggedBodyChars)).toBe(true);
  });

  /**
   * **The option alone is not the switch.** `RfcTransport` writes only when it
   * has a logger too, and the server's own path builds its connection with
   * none — `BaseMcpServer` passes `undefined`. So asking for the wire has to
   * bring a logger with it, or the documented switch does nothing exactly
   * where it is needed. A caller's own logger is never replaced.
   */
  it('brings a logger when the caller has none and the wire was asked for', () => {
    process.env.DEBUG_RFC_WIRE = 'true';
    createAbapConnection(rfcConfig as never, undefined, undefined);
    expect(loggerFromLastCall()).toBeDefined();
  });

  it('leaves the caller without one when the wire was not asked for', () => {
    delete process.env.DEBUG_RFC_WIRE;
    createAbapConnection(rfcConfig as never, undefined, undefined);
    expect(loggerFromLastCall()).toBeUndefined();
  });

  /**
   * **stdout belongs to JSON-RPC.** This server is usually run over stdio,
   * where every byte on stdout is protocol. `DefaultLogger` puts `debug` and
   * `info` there, so a wire log through one would interleave `RFC HEADERS: …`
   * with the messages the client is parsing and take the session down — a
   * debug switch that breaks the server being worse than one that prints
   * nothing, which is what this began as.
   */
  it('writes to stderr, never to the stream JSON-RPC uses', () => {
    process.env.DEBUG_RFC_WIRE = 'true';
    createAbapConnection(rfcConfig as never, undefined, undefined);
    const supplied = loggerFromLastCall() as {
      debug: (m: string) => void;
      info: (m: string) => void;
    };

    const out: string[] = [];
    const err: string[] = [];
    const stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown) => {
        out.push(String(chunk));
        return true;
      });
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: unknown) => {
        err.push(String(chunk));
        return true;
      });
    try {
      supplied.debug('RFC HEADERS: [{"NAME":"Accept"}]');
      supplied.info('something at info');
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }

    expect(err.join('')).toContain('RFC HEADERS:');
    expect(err.join('')).toContain('something at info');
    expect(out).toEqual([]);
  });

  it("never replaces the caller's own logger", () => {
    process.env.DEBUG_RFC_WIRE = 'true';
    const mine = { debug() {}, info() {}, warn() {}, error() {} };
    createAbapConnection(rfcConfig as never, mine as never, undefined);
    expect(loggerFromLastCall()).toBe(mine);
  });

  it('says nothing about the ceiling when it was not set', () => {
    process.env.DEBUG_RFC_WIRE = 'true';
    delete process.env.DEBUG_RFC_BODY_CHARS;
    connect();
    // Not `undefined` in the object either: the package has its own default
    // and should be left to apply it.
    expect(optionsFromLastCall()).toEqual({ logWire: true });
  });
});
