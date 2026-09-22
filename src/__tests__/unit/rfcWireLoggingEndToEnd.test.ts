import { RfcTransport } from '@mcp-abap-adt/connection';

/**
 * **Does asking for the wire actually produce a line?**
 *
 * `rfcWireLogging.test.ts` asserts the option reaches the transport's
 * constructor, which is what a caller controls — and it was not enough.
 * `RfcTransport` writes only when it has BOTH the option and a logger, and
 * the server's own path builds its connection with no logger at all
 * (`BaseMcpServer` passes `undefined`). So the option arrived, the logger did
 * not, and `DEBUG_RFC_WIRE=true` produced nothing on the one path that
 * matters. An assertion about an argument could not see that; an assertion
 * about the log can.
 *
 * The real transport is used here — not the mock the sibling file installs —
 * over a conversation that answers a fixed document, so what is asserted is
 * what the published package writes.
 */
const conversation = () => ({
  open: async () => {},
  close: async () => {},
  alive: true,
  call: async () => ({
    STATUS_LINE: 'HTTP/1.1 200 OK',
    MESSAGE_BODY: '<answer>from the server</answer>',
    HEADER_FIELDS: [{ NAME: 'content-type', VALUE: 'application/xml' }],
  }),
});

/** A logger that keeps what it was told, and nothing more. */
const recorder = () => {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      debug: (m: string) => lines.push(m),
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };
};

const send = async (options: { logWire: boolean }) => {
  const { lines, logger } = recorder();
  const transport = new RfcTransport(
    conversation as never,
    logger as never,
    options,
  );
  await transport.open();
  await transport.send({
    url: '/sap/bc/adt/packages',
    method: 'POST',
    data: '<pak:package>the body under suspicion</pak:package>',
    headers: {
      'Content-Type': 'application/xml',
      Authorization: 'Basic c2VjcmV0',
    },
  } as never);
  return lines;
};

describe('the wire log a caller asked for', () => {
  it('writes the headers and both bodies when logWire is on', async () => {
    const lines = await send({ logWire: true });

    expect(lines.some((l) => l.startsWith('RFC HEADERS:'))).toBe(true);
    expect(lines.some((l) => l.includes('the body under suspicion'))).toBe(
      true,
    );
    expect(lines.some((l) => l.includes('from the server'))).toBe(true);
  });

  it('redacts the credential header while keeping its name', async () => {
    const lines = await send({ logWire: true });
    const headers = lines.find((l) => l.startsWith('RFC HEADERS:')) ?? '';

    expect(headers).toContain('Authorization');
    expect(headers).toContain('[redacted]');
    expect(headers).not.toContain('c2VjcmV0');
  });

  it('writes neither when it was not asked', async () => {
    const lines = await send({ logWire: false });

    // The request line still goes out — that is the old behaviour, and it is
    // what made #222 unanswerable on its own.
    expect(lines.some((l) => l.startsWith('RFC →'))).toBe(true);
    expect(lines.some((l) => l.startsWith('RFC HEADERS:'))).toBe(false);
    expect(lines.some((l) => l.includes('the body under suspicion'))).toBe(
      false,
    );
  });
});
