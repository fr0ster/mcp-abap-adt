export function createSandboxServer() {
  // Lazy-load to avoid pulling in optional logger transports during bundling.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EmbeddableMcpServer } = require('./server/EmbeddableMcpServer.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MockAbapConnection } = require('./server/MockAbapConnection.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AbapConnection } = require('@mcp-abap-adt/connection');

  const connection =
    new MockAbapConnection() as unknown as typeof AbapConnection.prototype;
  const noopLogger = {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  };

  return new EmbeddableMcpServer({
    connection,
    logger: noopLogger,
    exposition: ['readonly', 'high', 'system', 'search'],
  });
}
