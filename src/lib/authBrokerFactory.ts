/**
 * Unified AuthBrokerFactory for both old and new servers
 * Implements unified broker creation logic according to UNIFIED_BROKER_LOGIC.md
 *
 * Key principles:
 * - One broker per destination (key = destination name or 'default')
 * - Default broker created at startup based on CLI args and .env file presence
 * - Shared stores for destinations with same directory and type
 */

import { AuthBroker } from "@mcp-abap-adt/auth-broker";
import { BtpTokenProvider } from "@mcp-abap-adt/auth-providers";
import {
  SafeAbapSessionStore,
  SafeBtpSessionStore,
  AbapSessionStore,
  BtpSessionStore,
  AbapServiceKeyStore,
  BtpServiceKeyStore
} from "@mcp-abap-adt/auth-stores";
import type { ISessionStore, IServiceKeyStore } from "@mcp-abap-adt/interfaces";
import { defaultLogger } from "@mcp-abap-adt/logger";
import * as path from "path";
import * as fs from "fs";
import { detectStoreType } from "./stores";
import { getPlatformPaths } from "./stores/platformPaths";
import type { ILogger } from "@mcp-abap-adt/interfaces";
import type { ServerConfig } from "./config/ServerConfig.js";

/**
 * @deprecated Use ServerConfig instead
 */
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
  /** Use auth-broker instead of .env file */
  useAuthBroker?: boolean;
  /** Logger instance */
  logger?: ILogger;
}

export class AuthBrokerFactory {
  // Map of brokers: key = destination name (or 'default' for default broker)
  private authBrokers = new Map<string, AuthBroker>();

  // Shared stores - one per store type and directory
  // Key: `${storeType}::${serviceKeysDir}::${sessionsDir}::${unsafe}`
  private sharedStores = new Map<string, { serviceKeyStore?: IServiceKeyStore; sessionStore: ISessionStore }>();

  private config: ServerConfig | AuthBrokerFactoryConfig;
  private defaultBrokerInitialized = false;

  constructor(config: ServerConfig | AuthBrokerFactoryConfig) {
    this.config = config;
  }

  /**
   * Create AuthBrokerFactory from ServerConfig (recommended)
   */
  static fromServerConfig(config: ServerConfig): AuthBrokerFactory {
    return new AuthBrokerFactory(config);
  }

  /**
   * Get config values (handles both ServerConfig and legacy AuthBrokerFactoryConfig)
   */
  private getConfigValue<K extends keyof ServerConfig>(
    key: K
  ): ServerConfig[K] | undefined {
    if (this.isServerConfig(this.config)) {
      return this.config[key];
    }
    // Legacy config mapping
    const legacyConfig = this.config as AuthBrokerFactoryConfig;
    switch (key) {
      case "defaultMcpDestination":
        return legacyConfig.defaultMcpDestination as any;
      case "defaultDestination":
        return legacyConfig.defaultDestination as any;
      case "envFilePath":
        return legacyConfig.envFilePath as any;
      case "authBrokerPath":
        return legacyConfig.authBrokerPath as any;
      case "unsafe":
        return legacyConfig.unsafe as any;
      case "useAuthBroker":
        // If explicitly set, use it; otherwise if --mcp is set, use auth-broker (--mcp implies auth-broker)
        return legacyConfig.useAuthBroker !== undefined
          ? legacyConfig.useAuthBroker as any
          : !!legacyConfig.defaultMcpDestination as any;
      case "transport":
        return {
          type: legacyConfig.transportType === "sse" ? "sse" :
                legacyConfig.transportType === "streamable-http" || legacyConfig.transportType === "http" ? "streamable-http" :
                "stdio",
        } as any;
      case "logger":
        return legacyConfig.logger as any;
      default:
        return undefined;
    }
  }

  private isServerConfig(config: any): config is ServerConfig {
    return config && typeof config === "object" && "transport" in config;
  }

  /**
   * Check if transport type supports AuthBroker
   */
  private isTransportSupported(): boolean {
    const transport = this.getConfigValue("transport");
    if (!transport) return false;
    return (
      transport.type === "streamable-http" ||
      transport.type === "stdio" ||
      transport.type === "sse"
    );
  }

  /**
   * Initialize default broker based on CLI args and .env file presence
   * Called once at server startup
   *
   * Creates default broker ('default' key) according to unified logic:
   * 1. --mcp=destination → default broker with serviceKeyStore for destination
   * 2. --env=path → default broker with sessionStore from path (no serviceKeyStore)
   * 3. stdio/sse + .env in current folder + NOT --auth-broker → default broker with sessionStore (no serviceKeyStore)
   * 4. Other cases → default broker NOT created
   */
  async initializeDefaultBroker(): Promise<void> {
    if (this.defaultBrokerInitialized) {
      return; // Already initialized
    }

    if (!this.isTransportSupported()) {
      return;
    }

    const logger = this.getConfigValue("logger") || defaultLogger;
    const defaultMcpDestination = this.getConfigValue("defaultMcpDestination");
    const envFilePath = this.getConfigValue("envFilePath");
    const useAuthBroker = this.getConfigValue("useAuthBroker");
    const unsafe = this.getConfigValue("unsafe") || false;
    const transport = this.getConfigValue("transport");
    const isStdio = transport?.type === "stdio";
    const isSse = transport?.type === "sse";
    const customPath = this.getConfigValue("authBrokerPath")
      ? path.resolve(this.getConfigValue("authBrokerPath")!)
      : undefined;

    // Check if .env exists in current directory
    const cwdEnvPath = path.resolve(process.cwd(), ".env");
    const hasCwdEnv = fs.existsSync(cwdEnvPath);

    // Determine if we should create default broker
    let shouldCreateDefault = false;
    let defaultBrokerConfig: {
      hasServiceKeyStore: boolean;
      serviceKeyDestination?: string;
      sessionStorePath: string;
      storeType: 'abap' | 'btp';
    } | null = null;

    // Variant 1: --mcp=destination specified
    if (defaultMcpDestination) {
      shouldCreateDefault = true;
      const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
      const sessionsPaths = getPlatformPaths(customPath, 'sessions');
      const serviceKeysDir = serviceKeysPaths[0];
      const sessionsDir = sessionsPaths[0];

      const detected = await detectStoreType(serviceKeysDir, defaultMcpDestination);

      defaultBrokerConfig = {
        hasServiceKeyStore: true,
        serviceKeyDestination: defaultMcpDestination,
        sessionStorePath: sessionsDir,
        storeType: detected.storeType,
      };
    }
    // Variant 2: --env=path specified
    else if (envFilePath) {
      shouldCreateDefault = true;
      const envFileDir = path.dirname(envFilePath);
      const serviceKeysPaths = getPlatformPaths(envFileDir, 'service-keys');
      const sessionsPaths = getPlatformPaths(envFileDir, 'sessions');
      const serviceKeysDir = serviceKeysPaths[0];
      const sessionsDir = sessionsPaths[0];

      const detected = await detectStoreType(serviceKeysDir);

      defaultBrokerConfig = {
        hasServiceKeyStore: false,
        sessionStorePath: sessionsDir,
        storeType: detected.storeType,
      };
    }
    // Variant 3: stdio/sse + .env in current folder + NOT --auth-broker
    else if ((isStdio || isSse) && hasCwdEnv && !useAuthBroker) {
      shouldCreateDefault = true;
      const serviceKeysPaths = getPlatformPaths(process.cwd(), 'service-keys');
      const sessionsPaths = getPlatformPaths(process.cwd(), 'sessions');
      const serviceKeysDir = serviceKeysPaths[0];
      const sessionsDir = sessionsPaths[0];

      const detected = await detectStoreType(serviceKeysDir);

      defaultBrokerConfig = {
        hasServiceKeyStore: false,
        sessionStorePath: sessionsDir,
        storeType: detected.storeType,
      };
    }

    if (shouldCreateDefault && defaultBrokerConfig) {
      try {
        logger.debug("Initializing default broker", {
          type: "DEFAULT_BROKER_INIT_START",
          hasServiceKeyStore: defaultBrokerConfig.hasServiceKeyStore,
          serviceKeyDestination: defaultBrokerConfig.serviceKeyDestination,
          sessionStorePath: defaultBrokerConfig.sessionStorePath,
          storeType: defaultBrokerConfig.storeType,
        });

        await this.createBrokerForDestination(
          'default',
          defaultBrokerConfig.hasServiceKeyStore,
          defaultBrokerConfig.serviceKeyDestination,
          defaultBrokerConfig.sessionStorePath,
          defaultBrokerConfig.storeType,
          unsafe
        );

        this.defaultBrokerInitialized = true;

        logger.info("Default broker initialized", {
          type: "DEFAULT_BROKER_INIT_SUCCESS",
          hasServiceKeyStore: defaultBrokerConfig.hasServiceKeyStore,
          serviceKeyDestination: defaultBrokerConfig.serviceKeyDestination,
        });
      } catch (error) {
        logger.error("Failed to initialize default broker", {
          type: "DEFAULT_BROKER_INIT_FAILED",
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't throw - server can still work without default broker
      }
    } else {
      logger.debug("Default broker not created (no conditions met)", {
        type: "DEFAULT_BROKER_NOT_CREATED",
        hasMcpDestination: !!defaultMcpDestination,
        hasEnvFilePath: !!envFilePath,
        isStdio,
        isSse,
        hasCwdEnv,
        useAuthBroker,
      });
    }

    this.defaultBrokerInitialized = true; // Mark as initialized even if not created
  }

  /**
   * Get default broker (if initialized)
   */
  getDefaultBroker(): AuthBroker | undefined {
    return this.authBrokers.get('default');
  }

  /**
   * Get or create AuthBroker for specific destination
   * For HTTP/SSE: called when destination is specified in headers
   * For stdio: called to get default broker
   */
  async getOrCreateAuthBroker(
    destination?: string,
    clientKey?: string
  ): Promise<AuthBroker | undefined> {
    if (!this.isTransportSupported()) {
      return undefined;
    }

    // If no destination specified, try to get default broker
    if (!destination) {
      // Ensure default broker is initialized
      if (!this.defaultBrokerInitialized) {
        await this.initializeDefaultBroker();
      }
      return this.getDefaultBroker();
    }

    // Get or create broker for specific destination
    if (!this.authBrokers.has(destination)) {
      const logger = this.getConfigValue("logger") || defaultLogger;
      const unsafe = this.getConfigValue("unsafe") || false;
      const customPath = this.getConfigValue("authBrokerPath")
        ? path.resolve(this.getConfigValue("authBrokerPath")!)
        : undefined;

      const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
      const sessionsPaths = getPlatformPaths(customPath, 'sessions');
      const serviceKeysDir = serviceKeysPaths[0];
      const sessionsDir = sessionsPaths[0];

      const detected = await detectStoreType(serviceKeysDir, destination);

      try {
        await this.createBrokerForDestination(
          destination,
          true, // Always create serviceKeyStore for specific destination
          destination,
          sessionsDir,
          detected.storeType,
          unsafe
        );
      } catch (error) {
        logger.error("Failed to create AuthBroker for destination", {
          type: "AUTH_BROKER_CREATE_FAILED",
          destination,
          error: error instanceof Error ? error.message : String(error),
        });
        return undefined;
      }
    }

    return this.authBrokers.get(destination);
  }

  /**
   * Create broker for specific destination
   * Internal method used by both initializeDefaultBroker and getOrCreateAuthBroker
   */
  private async createBrokerForDestination(
    brokerKey: string,
    hasServiceKeyStore: boolean,
    serviceKeyDestination: string | undefined,
    sessionsDir: string,
    storeType: 'abap' | 'btp',
    unsafe: boolean
  ): Promise<void> {
    const logger = this.getConfigValue("logger") || defaultLogger;
    const customPath = this.getConfigValue("authBrokerPath")
      ? path.resolve(this.getConfigValue("authBrokerPath")!)
      : undefined;

    const serviceKeysPaths = getPlatformPaths(customPath, 'service-keys');
    const serviceKeysDir = serviceKeysPaths[0];

    // Get or create shared stores
    const storeKey = `${storeType}::${serviceKeysDir}::${sessionsDir}::${unsafe}`;
    let stores = this.sharedStores.get(storeKey);

    if (!stores) {
      // Create new shared stores
      if (unsafe) {
        switch (storeType) {
          case 'abap':
            stores = {
              serviceKeyStore: hasServiceKeyStore ? new AbapServiceKeyStore(serviceKeysDir) : undefined,
              sessionStore: new AbapSessionStore(sessionsDir),
            };
            break;
          case 'btp':
            stores = {
              serviceKeyStore: hasServiceKeyStore ? new BtpServiceKeyStore(serviceKeysDir) : undefined,
              sessionStore: new BtpSessionStore(sessionsDir, ''),
            };
            break;
        }
      } else {
        switch (storeType) {
          case 'abap':
            // Use safe in-memory store to avoid stale/locked files in ~/.config
            stores = {
              serviceKeyStore: hasServiceKeyStore ? new AbapServiceKeyStore(serviceKeysDir) : undefined,
              sessionStore: new SafeAbapSessionStore(undefined, undefined),
            };
            break;
          case 'btp':
            stores = {
              serviceKeyStore: hasServiceKeyStore ? new BtpServiceKeyStore(serviceKeysDir) : undefined,
              sessionStore: new SafeBtpSessionStore(''),
            };
            break;
        }
      }

      this.sharedStores.set(storeKey, stores);

      logger.debug("Created shared stores", {
        type: "SHARED_STORES_CREATED",
        storeKey,
        storeType,
        hasServiceKeyStore,
        serviceKeysDir,
        sessionsDir,
        unsafe,
      });
    } else {
      // If stores exist but we need serviceKeyStore and it's missing, add it
      if (hasServiceKeyStore && !stores.serviceKeyStore) {
        switch (storeType) {
          case 'abap':
            stores.serviceKeyStore = new AbapServiceKeyStore(serviceKeysDir);
            break;
          case 'btp':
            stores.serviceKeyStore = new BtpServiceKeyStore(serviceKeysDir);
            break;
        }
        logger.debug("Added serviceKeyStore to existing shared stores", {
          type: "SERVICE_KEY_STORE_ADDED",
          storeKey,
          storeType,
        });
      }
    }

    const { serviceKeyStore, sessionStore } = stores;

    // Create token provider
    const tokenProvider = new BtpTokenProvider();

    // Pre-seed session store with data from service key (without tokens) to avoid stale/absent configs
    if (hasServiceKeyStore && serviceKeyDestination) {
      try {
        const skConn = await serviceKeyStore?.getConnectionConfig?.(serviceKeyDestination);
        const skAuth = await serviceKeyStore?.getAuthorizationConfig?.(serviceKeyDestination);

        if (skConn && sessionStore?.setConnectionConfig) {
          await sessionStore.setConnectionConfig(serviceKeyDestination, {
            ...skConn,
            authorizationToken: undefined,
          });
        }
        if (skAuth && sessionStore?.setAuthorizationConfig) {
          await sessionStore.setAuthorizationConfig(serviceKeyDestination, skAuth);
        }
      } catch (e) {
        logger.warn("Failed to seed session store from service key", {
          type: "SESSION_SEED_FAILED",
          brokerKey,
          serviceKeyDestination,
          error: (e as Error)?.message,
        });
      }
    }

    // Create AuthBroker
    const authBroker = new AuthBroker(
      {
        serviceKeyStore: hasServiceKeyStore ? serviceKeyStore : undefined,
        sessionStore,
        tokenProvider,
        // disable client_credentials for ABAP to force provider/interactive
        allowClientCredentials: storeType !== 'abap',
      } as any,
      'system',
      logger
    );

    this.authBrokers.set(brokerKey, authBroker);

    logger.info("AuthBroker created", {
      type: "AUTH_BROKER_CREATED",
      brokerKey,
      hasServiceKeyStore,
      serviceKeyDestination,
      storeType,
    });
  }

  /**
   * Get existing AuthBroker without creating new one
   */
  getAuthBroker(destination?: string): AuthBroker | undefined {
    if (!destination) {
      return this.getDefaultBroker();
    }
    return this.authBrokers.get(destination);
  }

  /**
   * Clear all AuthBroker instances
   */
  clear(): void {
    this.authBrokers.clear();
    this.sharedStores.clear();
    this.defaultBrokerInitialized = false;
  }
}
