import type { AuthBroker } from '@mcp-abap-adt/auth-broker';
import type { Logger } from '@mcp-abap-adt/logger';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { AuthBrokerFactory } from '../lib/auth/index.js';
import { noopLogger } from '../lib/handlerLogger.js';
import type { IHandlersRegistry } from '../lib/handlers/interfaces.js';
import { describeSystemFile } from '../lib/systems/envSystems.js';
import { BaseMcpServer } from './BaseMcpServer.js';
import { type ISwitchableServer, SystemSwitcher } from './SystemSwitcher.js';
import { registerSystemSwitchTools } from './systemSwitchTools.js';

const DEFAULT_VERSION = process.env.npm_package_version ?? '1.0.0';

export interface StdioServerOptions {
  name?: string;
  version?: string;
  logger?: Logger;
  /**
   * Enables the ListSystems/SwitchSystem tools. Without a factory the server
   * stays on the single system it was launched with.
   */
  authBrokerFactory?: AuthBrokerFactory;
  /** .env file the server was launched with — the initial active system. */
  envFilePath?: string;
  /** --auth-broker-path, used to locate the sessions folder when discovering. */
  authBrokerPath?: string;
}

/**
 * Minimal stdio server implementation based on BaseMcpServer.
 * Sets connection context once at startup and connects stdio transport.
 *
 * When an AuthBrokerFactory and a launch .env are supplied, the server also
 * exposes ListSystems/SwitchSystem so the active SAP system can be changed at
 * runtime (stdio is single-client, so process-wide SAP_* state is safe here).
 */
export class StdioServer extends BaseMcpServer {
  private switcher?: SystemSwitcher;

  constructor(
    private readonly handlersRegistry: IHandlersRegistry,
    private readonly broker: AuthBroker,
    private readonly opts?: StdioServerOptions,
  ) {
    super({
      name: opts?.name ?? 'mcp-abap-adt',
      version: opts?.version ?? DEFAULT_VERSION,
      logger: opts?.logger ?? noopLogger,
      dynamicSystem: !!(opts?.authBrokerFactory && opts?.envFilePath),
    });
  }

  async start(destination: string): Promise<void> {
    await this.setConnectionContext(destination, this.broker);
    this.registerHandlers(this.handlersRegistry);

    this.setupSystemSwitching();

    const transport = new StdioServerTransport();
    await this.connect(transport);
  }

  private setupSystemSwitching(): void {
    const factory = this.opts?.authBrokerFactory;
    const envFilePath = this.opts?.envFilePath;
    if (!factory || !envFilePath) return;

    const current = describeSystemFile(envFilePath);
    if (!current) {
      this.logger.debug(
        `[StdioServer] System switching disabled: ${envFilePath} is not a usable connection profile`,
      );
      return;
    }

    this.switcher = new SystemSwitcher(this.asSwitchable(), factory, {
      activeEnvPath: envFilePath,
      authBrokerPath: this.opts?.authBrokerPath,
      logger: this.logger,
    });

    this.switcher.adoptCurrent(current);
    registerSystemSwitchTools(this, this.switcher);
  }

  /** Exposes the protected server hooks the switcher drives. */
  private asSwitchable(): ISwitchableServer {
    return {
      resetConnection: () => this.resetConnection(),
      setConnectionContext: (dest, broker) =>
        this.setConnectionContext(dest, broker),
      applyToolAvailability: () => this.applyToolAvailability(),
      verifyConnection: async () => {
        await this.getConnection();
      },
    };
  }
}
