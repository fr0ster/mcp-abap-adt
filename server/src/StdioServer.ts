import type { IDestinations } from '@mcp-abap-adt/lib/auth';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import type { IHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import type { StateLogger } from '@mcp-abap-adt/lib/state';
import type { Logger } from '@mcp-abap-adt/logger';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CORE_VERSION } from './coreVersion.js';

export interface StdioServerOptions {
  name?: string;
  version?: string;
  logger?: Logger;
  /** The idle bound on held state, in minutes (at least 30, default 30). */
  stateIdleMinutes?: number;
  /** Where the state's lifecycle lines go; default stderr, always on. */
  stateLogger?: StateLogger;
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
      version: opts?.version ?? CORE_VERSION,
      logger: opts?.logger ?? noopLogger,
      stateIdleMinutes: opts?.stateIdleMinutes,
      stateLogger: opts?.stateLogger,
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
