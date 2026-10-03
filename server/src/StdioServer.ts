import type { IDestinations } from '@mcp-abap-adt/lib/auth';
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
 * The destination's settings and provider come from `IDestinations` — the
 * factory, or the inspection-only stand-in.
 */
export class StdioServer extends BaseMcpServer {
  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly destinations: IDestinations,
    opts?: StdioServerOptions,
  ) {
    super({
      name: opts?.name ?? 'mcp-abap-adt',
      version: opts?.version ?? DEFAULT_VERSION,
      logger: opts?.logger ?? noopLogger,
    });
  }

  async start(destination: string): Promise<void> {
    await this.setConnectionContext(destination, this.destinations);
    this.registerHandlers(this.handlersRegistry);

    const transport = new StdioServerTransport();
    await this.connect(transport);
  }
}

const INSPECTION_ONLY =
  'inspection-only mode: no connection parameters. To connect to an SAP system, use --mcp=<destination> or --env-path=<path>.';

/**
 * The destinations of inspection-only mode (stdio with neither `--mcp` nor an
 * `--env` file): the tools can be listed, and a tool call answers with the
 * refusal of a provider that has no credential, instead of dialling anywhere.
 */
export function inspectionOnlyDestinations(): IDestinations {
  const refused = async () => ({
    ok: false as const,
    refusal: { reason: INSPECTION_ONLY },
  });
  const provider: Awaited<ReturnType<IDestinations['getProvider']>> = {
    kind: 'inspection-only',
    prepare: refused,
    establish: refused,
    authorize: refused,
    rejected: refused,
  };
  return {
    settingsFor: async () => ({ url: 'http://mock', authType: 'basic' }),
    getProvider: async () => provider,
  };
}
