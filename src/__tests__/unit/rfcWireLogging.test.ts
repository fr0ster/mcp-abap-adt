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

  it('says nothing about the ceiling when it was not set', () => {
    process.env.DEBUG_RFC_WIRE = 'true';
    delete process.env.DEBUG_RFC_BODY_CHARS;
    connect();
    // Not `undefined` in the object either: the package has its own default
    // and should be left to apply it.
    expect(optionsFromLastCall()).toEqual({ logWire: true });
  });
});
