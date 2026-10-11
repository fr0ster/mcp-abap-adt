import type { AbapConnection } from '@mcp-abap-adt/connection';
import type { IAuthProviderError } from '@mcp-abap-adt/interfaces-auth';
import {
  type IDestinations,
  type ReadFailure,
  ServerRefusal,
} from '@mcp-abap-adt/lib/auth';
import { BaseMcpServer } from '@mcp-abap-adt/lib/embeddable';
import type { IHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { noopLogger } from '@mcp-abap-adt/lib/logger';
import { type StateLogger, stateLoggerOf } from '@mcp-abap-adt/lib/state';
import type { Logger } from '@mcp-abap-adt/logger';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { destinationFailureOf } from './auth/destinationFailure';
import { CORE_VERSION } from './coreVersion.js';

export interface StdioServerOptions {
  name?: string;
  version?: string;
  logger?: Logger;
  /** The idle bound on held state, in minutes (at least 30, default 30). */
  stateIdleMinutes?: number;
  /** Where the state's lifecycle lines go; default stderr, always on. */
  stateLogger?: StateLogger;
  /** The server's own sentence beside a chain failure (§7.4): the factory's `sentenceFor`. */
  sentenceFor?: (error: IAuthProviderError) => string | undefined;
}

/**
 * Minimal stdio server implementation based on BaseMcpServer.
 * Sets connection context once at startup and connects stdio transport.
 * The destination's settings and provider come from `IDestinations` — the
 * factory. Without destinations the server is in inspection-only mode: the
 * tools are listed, and a tool call answers the server's own
 * `inspection_only` refusal before any connection is built (D17).
 */
export class StdioServer extends BaseMcpServer {
  private readonly sentenceFor:
    | ((error: IAuthProviderError) => string | undefined)
    | undefined;

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly destinations: IDestinations | undefined,
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
    this.sentenceFor = opts?.sentenceFor;
  }

  /** The destination layer's failures first, then lib's reader (§7.1). */
  protected override readFailure(thrown: unknown): ReadFailure | undefined {
    return destinationFailureOf(thrown, { sentenceFor: this.sentenceFor });
  }

  /**
   * Serves `destination` (none: inspection-only mode) over `transport` —
   * stdio unless a host passes its own.
   */
  async start(
    destination: string | undefined,
    transport: Transport = new StdioServerTransport(),
  ): Promise<void> {
    if (destination !== undefined && this.destinations) {
      await this.setConnectionContext(destination, this.destinations);
    }
    this.registerHandlers(this.handlersRegistry);
    await this.connect(transport);
  }

  /** Inspection-only mode refuses here, before any connection is built. */
  protected override async getConnection(): Promise<AbapConnection> {
    if (!this.destinations) throw new ServerRefusal('inspection_only');
    return super.getConnection();
  }
}
