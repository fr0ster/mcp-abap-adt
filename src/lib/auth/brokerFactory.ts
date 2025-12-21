/**
 * Default implementation of AuthBrokerFactory
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
  BtpServiceKeyStore,
  EnvFileSessionStore
} from "@mcp-abap-adt/auth-stores";
import type { ISessionStore, IServiceKeyStore } from "@mcp-abap-adt/interfaces";
import { defaultLogger } from "@mcp-abap-adt/logger";
import * as path from "path";
import * as fs from "fs";
import { detectStoreType } from "../stores";
import { getPlatformPaths } from "../stores/platformPaths";
import type { ILogger } from "@mcp-abap-adt/interfaces";
import type { IAuthBrokerFactory } from "./IAuthBrokerFactory.js";
import type { IAuthBrokerFactoryConfig } from "./IAuthBrokerFactoryConfig.js";

/**
 * Default implementation of IAuthBrokerFactory
 */
export class AuthBrokerFactory implements IAuthBrokerFactory {
  // Map of brokers: key = destination name (or 'default' for default broker)
  private authBrokers = new Map<string, AuthBroker>();

  // Shared stores - one per store type and directory
  // Key: `${storeType}::${serviceKeysDir}::${sessionsDir}::${unsafe}`
  private sharedStores = new Map<string, { serviceKeyStore?: IServiceKeyStore; sessionStore: ISessionStore }>();

  private config: IAuthBrokerFactoryConfig;
  private defaultBrokerInitialized = false;

  constructor(config: IAuthBrokerFactoryConfig) {
    this.config = config;
  }

  /**
   * Get transport type from config
   */
  private getTransportType(): string {
    return this.config.transportType;
  }

  /**
   * Check if transport type supports AuthBroker
   */
  private isTransportSupported(): boolean {
    const transportType = this.getTransportType();
    if (!transportType) return false;
    return (
      transportType === "streamable-http" ||
      transportType === "http" ||
      transportType === "stdio" ||
      transportType === "sse"
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

    const logger = this.config.logger || defaultLogger;
    const defaultMcpDestination = this.config.defaultMcpDestination;
    const envFilePath = this.config.envFilePath;
    const useAuthBroker = this.config.useAuthBroker !== undefined
      ? this.config.useAuthBroker
      : !!this.config.defaultMcpDestination; // If --mcp is set, use auth-broker
    const unsafe = this.config.unsafe || false;
    const transportType = this.getTransportType();
    const isStdio = transportType === "stdio";
    const isSse = transportType === "sse";
    const isHttp = transportType === "http";

    logger.debug("[BrokerFactory] initializeDefaultBroker called", {
      type: "BROKER_INIT_START",
      defaultMcpDestination,
      envFilePath,
      useAuthBroker,
      transportType,
      isStdio,
      isSse,
      isHttp,
    });
    const customPath = this.config.authBrokerPath
      ? path.resolve(this.config.authBrokerPath)
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
      envFileToLoad?: string; // Track which .env file to load
      useEnvFileStore?: boolean; // Use EnvFileSessionStore directly
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
    // Variant 2: --env=path specified (stdio/sse/http)
    // Use EnvFileSessionStore directly - no need for separate session store
    else if (envFilePath && (isStdio || isSse || isHttp)) {
      shouldCreateDefault = true;
      logger.debug("Variant 2: --env specified, using EnvFileSessionStore", { envFilePath, isStdio, isSse, isHttp });

      defaultBrokerConfig = {
        hasServiceKeyStore: false,
        sessionStorePath: '', // Not used with EnvFileSessionStore
        storeType: 'abap', // Default, not used with EnvFileSessionStore
        envFileToLoad: envFilePath,
        useEnvFileStore: true, // Flag to use EnvFileSessionStore
      };
    }
    // Variant 3: stdio/sse/http + .env in current folder + NOT --auth-broker
    else if ((isStdio || isSse || isHttp) && hasCwdEnv && !useAuthBroker) {
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
        envFileToLoad: cwdEnvPath, // Use .env from current directory
      };
    }

    if (shouldCreateDefault && defaultBrokerConfig) {
      logger.debug("Creating default broker", { shouldCreateDefault, hasConfig: !!defaultBrokerConfig });
      try {
        logger.debug("Initializing default broker", {
          type: "DEFAULT_BROKER_INIT_START",
          hasServiceKeyStore: defaultBrokerConfig.hasServiceKeyStore,
          serviceKeyDestination: defaultBrokerConfig.serviceKeyDestination,
          sessionStorePath: defaultBrokerConfig.sessionStorePath,
          storeType: defaultBrokerConfig.storeType,
          useEnvFileStore: defaultBrokerConfig.useEnvFileStore,
        });

        // Variant 2: Use EnvFileSessionStore directly
        if (defaultBrokerConfig.useEnvFileStore && defaultBrokerConfig.envFileToLoad) {
          await this.createBrokerWithEnvFileStore(
            'default',
            defaultBrokerConfig.envFileToLoad,
            logger
          );
        } else {
          // Variant 1 and 3: Use standard stores
          await this.createBrokerForDestination(
            'default',
            defaultBrokerConfig.hasServiceKeyStore,
            defaultBrokerConfig.serviceKeyDestination,
            defaultBrokerConfig.sessionStorePath,
            defaultBrokerConfig.storeType,
            unsafe
          );

          // Load .env file into session store for Variant 3 (cwd .env)
          if (!defaultBrokerConfig.hasServiceKeyStore && defaultBrokerConfig.envFileToLoad) {
            const broker = this.authBrokers.get('default');
            if (broker) {
              try {
                await this.loadEnvFileIntoSessionStore(defaultBrokerConfig.envFileToLoad, 'default', broker, logger);
              } catch (error) {
                logger.error("Failed to load .env file into session store", {
                  type: "ENV_LOAD_FAILED",
                  envFilePath: defaultBrokerConfig.envFileToLoad,
                  error: error instanceof Error ? error.message : String(error),
                });
                throw error;
              }
            }
          }
        }

        this.defaultBrokerInitialized = true;

        logger.info("Default broker initialized", {
          type: "DEFAULT_BROKER_INIT_SUCCESS",
          hasServiceKeyStore: defaultBrokerConfig.hasServiceKeyStore,
          serviceKeyDestination: defaultBrokerConfig.serviceKeyDestination,
          hasEnvFile: !defaultBrokerConfig.hasServiceKeyStore && !!defaultBrokerConfig.envFileToLoad,
          envFilePath: defaultBrokerConfig.envFileToLoad,
          useEnvFileStore: defaultBrokerConfig.useEnvFileStore,
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
    return this.authBrokers.get('default') || undefined;
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

    // Special case: if destination is 'default', return default broker (don't create new one)
    if (destination === 'default') {
      // Ensure default broker is initialized
      if (!this.defaultBrokerInitialized) {
        await this.initializeDefaultBroker();
      }
      return this.getDefaultBroker();
    }

    // Get or create broker for specific destination
    if (!this.authBrokers.has(destination)) {
      const logger = this.config.logger || defaultLogger;
      const unsafe = this.config.unsafe || false;
      const customPath = this.config.authBrokerPath
        ? path.resolve(this.config.authBrokerPath)
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

    return this.authBrokers.get(destination) || undefined;
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
    const logger = this.config.logger || defaultLogger;
    const customPath = this.config.authBrokerPath
      ? path.resolve(this.config.authBrokerPath)
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

    // Create token provider with browser auth port from config (to avoid port conflicts)
    const tokenProvider = new BtpTokenProvider(this.config.browserAuthPort);

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
        // Allow client_credentials flow for all store types (including ABAP)
        // This prevents browser auth conflicts when UAA credentials are available
        allowClientCredentials: true,
      } as any,
      this.config.browser || 'system',
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
   * Create broker using EnvFileSessionStore directly
   * Used for --env=path option (Variant 2)
   *
   * EnvFileSessionStore reads connection config directly from .env file
   * and stores token updates in memory (doesn't modify original file)
   */
  private async createBrokerWithEnvFileStore(
    brokerKey: string,
    envFilePath: string,
    logger: ILogger
  ): Promise<void> {
    // Create EnvFileSessionStore that reads from specified .env file
    const sessionStore = new EnvFileSessionStore(envFilePath, logger);

    // Get auth type from .env file to determine if we need token provider
    const authType = sessionStore.getAuthType();

    if (!authType) {
      throw new Error(`Unable to determine auth type from .env file: ${envFilePath}`);
    }

    logger.debug("Creating broker with EnvFileSessionStore", {
      type: "ENV_FILE_STORE_CREATE",
      brokerKey,
      envFilePath,
      authType,
    });

    // Create token provider for JWT auth (needed for token refresh)
    // For basic auth, tokenProvider is not used but AuthBroker still expects it
    const tokenProvider = new BtpTokenProvider(this.config.browserAuthPort);

    // Create AuthBroker with EnvFileSessionStore
    const authBroker = new AuthBroker(
      {
        serviceKeyStore: undefined, // No service key store for --env mode
        sessionStore,
        tokenProvider,
        allowClientCredentials: authType === 'jwt', // Only for JWT
      } as any,
      this.config.browser || 'system',
      logger
    );

    this.authBrokers.set(brokerKey, authBroker);

    logger.info("AuthBroker created with EnvFileSessionStore", {
      type: "AUTH_BROKER_CREATED_ENV_FILE",
      brokerKey,
      envFilePath,
      authType,
    });
  }

  /**
   * Load .env file and populate session store with connection config
   * @param envFilePath Path to .env file
   * @param destination Destination name (usually 'default')
   * @param broker AuthBroker instance
   * @param logger Logger instance
   * @returns Auth type from .env file ('basic' or 'jwt')
   */
  private async loadEnvFileIntoSessionStore(
    envFilePath: string,
    destination: string,
    broker: AuthBroker,
    logger: ILogger
  ): Promise<'basic' | 'jwt'> {
    if (!fs.existsSync(envFilePath)) {
      throw new Error(`.env file not found: ${envFilePath}`);
    }

    logger.debug("Loading .env file into session store", {
      type: "ENV_LOAD_START",
      envFilePath,
      destination,
    });

    // Parse .env file
    const envContent = fs.readFileSync(envFilePath, "utf8");
    const envVars: Record<string, string> = {};

    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1);

      // Remove inline comments
      const commentIndex = value.indexOf('#');
      if (commentIndex !== -1) {
        value = value.substring(0, commentIndex).trim();
      } else {
        value = value.trim();
      }

      // Remove quotes
      value = value.replace(/^["']+|["']+$/g, '').trim();

      if (key) {
        envVars[key] = value;
      }
    }

    // Validate required fields
    if (!envVars.SAP_URL) {
      throw new Error(".env file missing SAP_URL");
    }

    // Build connection config from .env
    const connectionConfig: any = {
      serviceUrl: envVars.SAP_URL,
      sapClient: envVars.SAP_CLIENT,
    };

    // Check auth type
    const authType = (envVars.SAP_AUTH_TYPE || 'basic') as 'basic' | 'jwt';
    connectionConfig.authType = authType;

    if (authType === 'basic') {
      if (!envVars.SAP_USERNAME || !envVars.SAP_PASSWORD) {
        throw new Error(".env file missing SAP_USERNAME or SAP_PASSWORD for basic auth");
      }
      connectionConfig.username = envVars.SAP_USERNAME;
      connectionConfig.password = envVars.SAP_PASSWORD;
    } else if (authType === 'jwt') {
      if (!envVars.SAP_JWT_TOKEN) {
        throw new Error(".env file missing SAP_JWT_TOKEN for JWT auth");
      }
      connectionConfig.authorizationToken = envVars.SAP_JWT_TOKEN;
      // Also store refresh token if available
      if (envVars.SAP_REFRESH_TOKEN) {
        connectionConfig.refreshToken = envVars.SAP_REFRESH_TOKEN;
      }
    }

    // Store in session store via broker's session store
    const sessionStore = (broker as any).sessionStore as ISessionStore;
    if (sessionStore?.setConnectionConfig) {
      await sessionStore.setConnectionConfig(destination, connectionConfig);
      logger.info(".env file loaded into session store", {
        type: "ENV_LOAD_SUCCESS",
        destination,
        serviceUrl: connectionConfig.serviceUrl,
        authType: connectionConfig.authType,
      });
    } else {
      throw new Error("Session store does not support setConnectionConfig");
    }

    return authType;
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
