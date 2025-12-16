/**
 * Factory for creating and managing AuthBroker instances
 * Handles creation of stores (serviceKeyStore, sessionStore) and token providers
 * Supports both full AuthBroker (with sessionStore) and minimal setup (only serviceKeyStore for on-premise)
 */

import { AuthBroker } from "@mcp-abap-adt/auth-broker";
import { BtpTokenProvider } from "@mcp-abap-adt/auth-providers";
import { SafeAbapSessionStore, SafeBtpSessionStore } from "@mcp-abap-adt/auth-stores";
import type { ISessionStore, IServiceKeyStore } from "@mcp-abap-adt/interfaces";
import { defaultLogger } from "@mcp-abap-adt/logger";
import * as path from "path";
import { getPlatformStoresAsync, detectStoreType } from "./stores";
import { getPlatformPaths } from "./stores/platformPaths";
import type { ILogger } from "@mcp-abap-adt/interfaces";

export interface AuthBrokerFactoryConfig {
  /** Default MCP destination from --mcp parameter */
  defaultMcpDestination?: string;
  /** Default destination (from --mcp or .env) */
  defaultDestination?: string;
  /** Path to .env file */
  envFilePath?: string;
  /** Custom path for auth broker storage */
  authBrokerPath?: string;
  /** Use unsafe mode (file-based session store) */
  unsafe: boolean;
  /** Transport type */
  transportType: string;
  /** Logger instance */
  logger?: ILogger;
}

export class AuthBrokerFactory {
  private authBrokers = new Map<string, AuthBroker>();
  private config: AuthBrokerFactoryConfig;

  constructor(config: AuthBrokerFactoryConfig) {
    this.config = config;
  }

  /**
   * Build key for AuthBroker map
   */
  private buildAuthBrokerKey(destination?: string, clientKey?: string): string {
    const destPart = destination || 'default';
    const clientPart = clientKey || 'global';
    return `${destPart}::${clientPart}`;
  }

  /**
   * Check if transport type supports AuthBroker
   */
  private isTransportSupported(): boolean {
    const { transportType } = this.config;
    return (
      transportType === "streamable-http" ||
      transportType === "stdio" ||
      transportType === "sse"
    );
  }

  /**
   * Get or create AuthBroker for destination
   * 
   * Logic:
   * - Full AuthBroker: when NOT using --mcp (or using --env, or .env found in current folder)
   *   Creates serviceKeyStore, sessionStore, and tokenProvider
   * - Minimal setup: when using --mcp (for on-premise systems)
   *   Creates only serviceKeyStore (with minimal sessionStore for AuthBroker requirements)
   */
  async getOrCreateAuthBroker(
    destination?: string,
    clientKey?: string
  ): Promise<AuthBroker | undefined> {
    if (!this.isTransportSupported()) {
      return undefined;
    }

    const actualDestination = destination || this.config.defaultDestination;
    const customPath = this.config.authBrokerPath
      ? path.resolve(this.config.authBrokerPath)
      : undefined;

    const brokerKey = this.buildAuthBrokerKey(actualDestination, clientKey);

    // Get or create AuthBroker for specific destination/client
    if (!this.authBrokers.has(brokerKey)) {
      try {
        this.config.logger?.debug("Creating AuthBroker for destination", {
          type: "AUTH_BROKER_CREATE_START",
          destination: actualDestination || 'default',
          clientKey: clientKey || 'global',
          platform: process.platform,
          unsafe: this.config.unsafe,
          hasMcpDestination: !!this.config.defaultMcpDestination,
        });

        let sessionStore: ISessionStore;
        let serviceKeyStore: IServiceKeyStore;
        let storeType: 'abap' | 'btp';

        // Determine if we should create full AuthBroker or only serviceKeyStore
        // Full AuthBroker: when NOT using --mcp (or using --env, or .env found in current folder)
        // Only serviceKeyStore: when using --mcp (for on-premise systems with basic auth)
        const shouldCreateFullBroker =
          !this.config.defaultMcpDestination &&
          (this.config.envFilePath || !actualDestination);

        if (shouldCreateFullBroker && this.config.envFilePath) {
          // Full AuthBroker: --env specified or .env found, create SessionStore from .env file directory
          const envFileDir = path.dirname(this.config.envFilePath);

          const stores = await getPlatformStoresAsync(
            envFileDir,
            this.config.unsafe,
            actualDestination
          );
          serviceKeyStore = stores.serviceKeyStore;
          sessionStore = stores.sessionStore;
          storeType = stores.storeType;

          this.config.logger?.debug("Created SessionStore from .env file directory", {
            type: "SESSION_STORE_FROM_ENV",
            envFilePath: this.config.envFilePath,
            envFileDir,
            destination: actualDestination || 'default',
            storeType,
            unsafe: this.config.unsafe,
          });
        } else if (shouldCreateFullBroker) {
          // Full AuthBroker: no --mcp, no --env, but .env might be in current folder
          const stores = await getPlatformStoresAsync(
            customPath,
            this.config.unsafe,
            actualDestination
          );
          serviceKeyStore = stores.serviceKeyStore;
          sessionStore = stores.sessionStore;
          storeType = stores.storeType;
        } else {
          // Only serviceKeyStore: --mcp specified (for on-premise systems)
          // Create only serviceKeyStore, no sessionStore or tokenProvider
          // Data will be loaded from .env files directly via serviceKeyStore
          const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
          const serviceKeysDir = serviceKeysPaths[0];

          // Auto-detect store type
          const detected = await detectStoreType(serviceKeysDir, actualDestination);
          serviceKeyStore = detected.serviceKeyStore;
          storeType = detected.storeType;

          // Create minimal sessionStore (required by AuthBroker, but won't be used for on-premise)
          // Use SafeSessionStore (in-memory) since we don't need persistence for on-premise basic auth
          switch (storeType) {
            case 'abap':
              sessionStore = new SafeAbapSessionStore();
              break;
            case 'btp':
              sessionStore = new SafeBtpSessionStore('');
              break;
          }

          this.config.logger?.debug(
            "Created only serviceKeyStore for --mcp destination (on-premise)",
            {
              type: "SERVICE_KEY_STORE_ONLY_FOR_MCP",
              destination: actualDestination || 'default',
              storeType,
              serviceKeysDir,
            }
          );
        }

        this.config.logger?.debug("Platform stores created", {
          type: "PLATFORM_STORES_CREATED",
          destination: actualDestination || 'default',
          clientKey: clientKey || 'global',
          platform: process.platform,
          unsafe: this.config.unsafe,
          storeType: storeType,
          sessionStoreType: this.config.unsafe
            ? 'FileSessionStore'
            : 'SafeSessionStore (in-memory)',
          hasMcpDestination: !!this.config.defaultMcpDestination,
        });

        // Determine token provider based on store type
        // ABAP and BTP use BtpTokenProvider (browser-based OAuth2)
        const tokenProvider = new BtpTokenProvider();

        const authBroker = new AuthBroker(
          {
            serviceKeyStore,
            sessionStore,
            tokenProvider,
          },
          'system',
          this.config.logger || defaultLogger
        );

        this.authBrokers.set(brokerKey, authBroker);

        this.config.logger?.info("AuthBroker created for destination", {
          type: "AUTH_BROKER_CREATED",
          destination: actualDestination || 'default',
          clientKey: clientKey || 'global',
          platform: process.platform,
          hasMcpDestination: !!this.config.defaultMcpDestination,
        });
      } catch (error) {
        this.config.logger?.error("Failed to create AuthBroker for destination", {
          type: "AUTH_BROKER_CREATE_FAILED",
          destination: actualDestination || 'default',
          clientKey: clientKey || 'global',
          platform: process.platform,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return undefined;
      }
    }

    const authBroker = this.authBrokers.get(brokerKey);
    if (!authBroker) {
      this.config.logger?.error("AuthBroker not found in map after creation", {
        type: "AUTH_BROKER_NOT_FOUND",
        destination: actualDestination || 'default',
        clientKey: clientKey || 'global',
        mapSize: this.authBrokers.size,
        mapKeys: Array.from(this.authBrokers.keys()).slice(0, 20),
      });
    }

    return authBroker;
  }

  /**
   * Get existing AuthBroker without creating new one
   */
  getAuthBroker(destination?: string, clientKey?: string): AuthBroker | undefined {
    const actualDestination = destination || this.config.defaultDestination;
    const brokerKey = this.buildAuthBrokerKey(actualDestination, clientKey);
    return this.authBrokers.get(brokerKey);
  }

  /**
   * Clear all AuthBroker instances
   */
  clear(): void {
    this.authBrokers.clear();
  }
}

