import {
  type IDestinations,
  NO_CREDENTIAL_REFUSAL,
} from '@mcp-abap-adt/lib/auth';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import type { IHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import { type StateLogger, stateLoggerOf } from '@mcp-abap-adt/lib/state';
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
      // From the options as given: the silent default above is never the state's.
      stateLogger: stateLoggerOf(opts ?? {}),
    });
  }

  async start(destination: string): Promise<void> {
    await this.setConnectionContext(destination, this.destinations);
    this.registerHandlers(this.handlersRegistry);

    const transport = new StdioServerTransport();
    await this.connect(transport);
  }
}

/**
 * The destinations of inspection-only mode (stdio with neither `--mcp` nor an
 * `--env` file): the tools can be listed, and a tool call answers with the
 * refusal of a provider that has no credential, instead of dialling anywhere.
 * The refusal is minted (interfaces-auth 7), so its words are auth-errors'
 * own — "this connection has no credential to renew"; how to connect is said
 * on stderr at startup.
 */
export function inspectionOnlyDestinations(): IDestinations {
  const refused = async () => NO_CREDENTIAL_REFUSAL;
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
