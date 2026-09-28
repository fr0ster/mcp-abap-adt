import type { AuthBroker } from '@mcp-abap-adt/auth-broker';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import type { IHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import type { Logger } from '@mcp-abap-adt/logger';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const DEFAULT_VERSION = process.env.npm_package_version ?? '1.0.0';

export interface StdioServerOptions {
  name?: string;
  version?: string;
  logger?: Logger;
}

/**
 * Minimal stdio server implementation based on BaseMcpServer.
 * Sets connection context once at startup and connects stdio transport.
 */
export class StdioServer extends BaseMcpServer {
  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly broker: AuthBroker,
    opts?: StdioServerOptions,
  ) {
    super({
      name: opts?.name ?? 'mcp-abap-adt',
      version: opts?.version ?? DEFAULT_VERSION,
      logger: opts?.logger ?? noopLogger,
    });
  }

  async start(destination: string): Promise<void> {
    await this.setConnectionContext(destination, this.broker);
    this.registerHandlers(this.handlersRegistry);

    const transport = new StdioServerTransport();
    await this.connect(transport);
  }
}
