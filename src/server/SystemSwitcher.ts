/**
 * Runtime SAP system switching for stdio mode.
 *
 * Lets an agent point the running server at a different .env profile without
 * restarting the MCP client. Only stdio is supported on purpose: HTTP/SSE
 * serve several clients from one process, where mutating process-wide SAP_*
 * state would leak across sessions (see setConnectionContextFromHeaders).
 */

import type { AuthBroker } from '@mcp-abap-adt/auth-broker';
import type { Logger } from '@mcp-abap-adt/logger';
import type { AuthBrokerFactory } from '../lib/auth/index.js';
import {
  applySystemEnv,
  getActiveSystem,
  setActiveSystem,
} from '../lib/systems/activeSystem.js';
import {
  type DiscoverSystemsOptions,
  discoverSystems,
  publicSystemInfo,
  resolveSystemRef,
  type SystemDescriptor,
} from '../lib/systems/envSystems.js';

/**
 * The slice of BaseMcpServer the switcher drives. Kept narrow so the switch
 * sequence is testable without a live MCP server.
 */
export interface ISwitchableServer {
  resetConnection(): Promise<void>;
  setConnectionContext(destination: string, broker: AuthBroker): Promise<void>;
  /** Re-gates tools for the new system; emits tools/list_changed if it changed. */
  applyToolAvailability(): void;
  /** Establishes the connection so a broken profile fails here, not later. */
  verifyConnection(): Promise<void>;
}

export interface SystemSwitcherOptions extends DiscoverSystemsOptions {
  logger?: Logger;
}

export interface SwitchResult {
  active: ReturnType<typeof publicSystemInfo>;
  previous?: string;
  rolledBackFrom?: string;
}

/** Broker key namespace so switched systems never clash with 'default'. */
function brokerKeyFor(system: SystemDescriptor): string {
  return `system:${system.name}`;
}

export class SystemSwitcher {
  constructor(
    private readonly server: ISwitchableServer,
    private readonly authBrokerFactory: AuthBrokerFactory,
    private readonly options: SystemSwitcherOptions = {},
  ) {}

  private get discoveryOptions(): DiscoverSystemsOptions {
    return {
      activeEnvPath: this.options.activeEnvPath,
      authBrokerPath: this.options.authBrokerPath,
    };
  }

  list(): {
    active?: string;
    systems: Array<ReturnType<typeof publicSystemInfo> & { active: boolean }>;
  } {
    const active = getActiveSystem();
    const systems = discoverSystems(this.discoveryOptions);

    // The system the server booted with may live outside the search dirs.
    if (active && !systems.some((s) => s.envPath === active.envPath)) {
      systems.unshift(active);
    }

    return {
      active: active?.name,
      systems: systems.map((system) => ({
        ...publicSystemInfo(system),
        active: !!active && system.envPath === active.envPath,
      })),
    };
  }

  /**
   * Point the server at another system. On failure the previous system is
   * restored, so a typo or an unreachable host never leaves the server
   * without a working connection.
   */
  async switchTo(ref: string): Promise<SwitchResult> {
    const { system, available } = resolveSystemRef(ref, this.discoveryOptions);

    if (!system) {
      const names = available.map((candidate) => candidate.name).join(', ');
      throw new Error(
        `Unknown system "${ref}". Available: ${names || '(none found)'}. ` +
          `Pass a name from ListSystems or a path to a .env file.`,
      );
    }

    const previous = getActiveSystem();
    if (previous && previous.envPath === system.envPath) {
      // Still re-apply: the .env file may have been edited since startup.
      this.options.logger?.debug(
        `[SystemSwitcher] Re-activating current system ${system.name}`,
      );
    }

    try {
      await this.activate(system);
      return {
        active: publicSystemInfo(system),
        previous: previous?.name,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (!previous)
        throw new Error(`Switch to "${system.name}" failed: ${message}`);

      try {
        await this.activate(previous);
      } catch (rollbackError) {
        const rollbackMessage =
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError);
        throw new Error(
          `Switch to "${system.name}" failed: ${message}. ` +
            `Rollback to "${previous.name}" also failed: ${rollbackMessage}. ` +
            `Restart the MCP server.`,
        );
      }

      throw new Error(
        `Switch to "${system.name}" failed: ${message}. ` +
          `Rolled back to "${previous.name}".`,
      );
    }
  }

  /** Records the startup system without touching the connection. */
  adoptCurrent(system: SystemDescriptor): void {
    setActiveSystem(system);
    this.server.applyToolAvailability();
  }

  private async activate(system: SystemDescriptor): Promise<void> {
    // Order matters: drop the old connection (and the system-context cache it
    // fed) before any env key changes, so nothing is rebuilt from a half-
    // applied profile.
    await this.server.resetConnection();
    applySystemEnv(system.env);
    setActiveSystem(system);

    const brokerKey = brokerKeyFor(system);
    const broker = await this.authBrokerFactory.createEnvFileBroker(
      brokerKey,
      system.envPath,
    );

    await this.server.setConnectionContext(brokerKey, broker);
    await this.server.verifyConnection();
    this.server.applyToolAvailability();

    this.options.logger?.info(
      `[SystemSwitcher] Active system: ${system.name} (${system.url}, ${system.systemType}/${system.connectionType})`,
    );
  }
}
