/**
 * Default implementation of AuthBrokerFactory
 * Implements unified broker creation logic according to UNIFIED_BROKER_LOGIC.md
 *
 * Key principles:
 * - One broker per destination (key = destination name or 'default')
 * - Default broker created at startup based on CLI args and .env file presence
 * - Shared stores for destinations with same directory and type
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuthBroker } from '@mcp-abap-adt/auth-broker';
import { AuthorizationCodeProvider } from '@mcp-abap-adt/auth-providers';
import {
  AbapServiceKeyStore,
  AbapSessionStore,
  BtpServiceKeyStore,
  BtpSessionStore,
  EnvFileSessionStore,
  SafeAbapSessionStore,
  SafeBtpSessionStore,
} from '@mcp-abap-adt/auth-stores';
import type {
  IAuthorizationConfig,
  IConnectionConfig,
  ILogger,
  IServiceKeyStore,
  ISessionStore,
  ITokenProvider,
  ITokenResult,
} from '@mcp-abap-adt/interfaces';
import { defaultLogger } from '@mcp-abap-adt/logger';
import { detectStoreType } from '../stores';
import { getPlatformPaths } from '../stores/platformPaths';
import type { IAuthBrokerFactory } from './IAuthBrokerFactory.js';
import type { IAuthBrokerFactoryConfig } from './IAuthBrokerFactoryConfig.js';

/**
 * Default implementation of IAuthBrokerFactory
 */
export class AuthBrokerFactory implements IAuthBrokerFactory {
  // Map of brokers: key = destination name (or 'default' for default broker)
  private authBrokers = new Map<string, AuthBroker>();

  // Shared stores - one per store type and directory
  // Key: `${storeType}::${serviceKeysDir}::${sessionsDir}::${unsafe}`
  private sharedStores = new Map<
    string,
    { serviceKeyStore?: IServiceKeyStore; sessionStore: ISessionStore }
  >();

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
      transportType === 'streamable-http' ||
      transportType === 'http' ||
      transportType === 'stdio' ||
      transportType === 'sse'
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

    // Only use logger if explicitly provided (no fallback to defaultLogger)
    // This prevents unwanted logging when DEBUG variables are not set
    const logger = this.config.logger;
    const defaultMcpDestination = this.config.defaultMcpDestination;
    const envFilePath = this.config.envFilePath;
    const useAuthBroker =
      this.config.useAuthBroker !== undefined
        ? this.config.useAuthBroker
        : !!this.config.defaultMcpDestination; // If --mcp is set, use auth-broker
    const unsafe = this.config.unsafe || false;
    const transportType = this.getTransportType();
    const isStdio = transportType === 'stdio';
    const isSse = transportType === 'sse';
    const isHttp = transportType === 'http';

    logger?.debug('[BrokerFactory] initializeDefaultBroker called', {
      type: 'BROKER_INIT_START',
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
    const cwdEnvPath = path.resolve(process.cwd(), '.env');
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

      const detected = await detectStoreType(
        serviceKeysDir,
        defaultMcpDestination,
      );

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
      logger?.debug('Variant 2: --env specified, using EnvFileSessionStore', {
        envFilePath,
        isStdio,
        isSse,
        isHttp,
      });

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
      logger?.debug('Creating default broker', {
        shouldCreateDefault,
        hasConfig: !!defaultBrokerConfig,
      });
      try {
        logger?.debug('Initializing default broker', {
          type: 'DEFAULT_BROKER_INIT_START',
          hasServiceKeyStore: defaultBrokerConfig.hasServiceKeyStore,
          serviceKeyDestination: defaultBrokerConfig.serviceKeyDestination,
          sessionStorePath: defaultBrokerConfig.sessionStorePath,
          storeType: defaultBrokerConfig.storeType,
          useEnvFileStore: defaultBrokerConfig.useEnvFileStore,
        });

        // Variant 2: Use EnvFileSessionStore directly
        if (
          defaultBrokerConfig.useEnvFileStore &&
          defaultBrokerConfig.envFileToLoad
        ) {
          await this.createBrokerWithEnvFileStore(
            'default',
            defaultBrokerConfig.envFileToLoad,
            logger,
          );
        } else {
          // Variant 1 and 3: Use standard stores
          await this.createBrokerForDestination(
            'default',
            defaultBrokerConfig.hasServiceKeyStore,
            defaultBrokerConfig.serviceKeyDestination,
            defaultBrokerConfig.sessionStorePath,
            defaultBrokerConfig.storeType,
            unsafe,
          );

          // Load .env file into session store for Variant 3 (cwd .env)
          if (
            !defaultBrokerConfig.hasServiceKeyStore &&
            defaultBrokerConfig.envFileToLoad
          ) {
            const broker = this.authBrokers.get('default');
            if (broker) {
              try {
                await this.loadEnvFileIntoSessionStore(
                  defaultBrokerConfig.envFileToLoad,
                  'default',
                  broker,
                  logger,
                );
              } catch (error) {
                logger?.debug('Failed to load .env file into session store', {
                  type: 'ENV_LOAD_FAILED',
                  envFilePath: defaultBrokerConfig.envFileToLoad,
                  error: error instanceof Error ? error.message : String(error),
                });
                throw error;
              }
            }
          }
        }

        this.defaultBrokerInitialized = true;

        logger?.debug('Default broker initialized', {
          type: 'DEFAULT_BROKER_INIT_SUCCESS',
          hasServiceKeyStore: defaultBrokerConfig.hasServiceKeyStore,
          serviceKeyDestination: defaultBrokerConfig.serviceKeyDestination,
          hasEnvFile:
            !defaultBrokerConfig.hasServiceKeyStore &&
            !!defaultBrokerConfig.envFileToLoad,
          envFilePath: defaultBrokerConfig.envFileToLoad,
          useEnvFileStore: defaultBrokerConfig.useEnvFileStore,
        });
      } catch (error) {
        logger?.debug('Failed to initialize default broker', {
          type: 'DEFAULT_BROKER_INIT_FAILED',
          error: error instanceof Error ? error.message : String(error),
        });
        // Don't throw - server can still work without default broker
      }
    } else {
      logger?.debug('Default broker not created (no conditions met)', {
        type: 'DEFAULT_BROKER_NOT_CREATED',
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
    _clientKey?: string,
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
      // Only use logger if explicitly provided (no fallback to defaultLogger)
      // This prevents unwanted logging when DEBUG variables are not set
      const logger = this.config.logger;
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
          unsafe,
        );
      } catch (error) {
        logger?.debug('Failed to create AuthBroker for destination', {
          type: 'AUTH_BROKER_CREATE_FAILED',
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
    unsafe: boolean,
  ): Promise<void> {
    // Only use logger if explicitly provided (no fallback to defaultLogger)
    // This prevents unwanted logging when DEBUG variables are not set
    const logger = this.config.logger;
    // Only use specific loggers if DEBUG variables are set, no fallback
    const storeLogger = this.config.storeLogger;
    const _providerLogger = this.config.providerLogger;
    const brokerLogger = this.config.brokerLogger;
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
              serviceKeyStore: hasServiceKeyStore
                ? new AbapServiceKeyStore(serviceKeysDir, storeLogger)
                : undefined,
              sessionStore: new AbapSessionStore(sessionsDir, storeLogger),
            };
            break;
          case 'btp':
            stores = {
              serviceKeyStore: hasServiceKeyStore
                ? new BtpServiceKeyStore(serviceKeysDir, storeLogger)
                : undefined,
              sessionStore: new BtpSessionStore(sessionsDir, '', storeLogger),
            };
            break;
        }
      } else {
        switch (storeType) {
          case 'abap':
            // Use safe in-memory store to avoid stale/locked files in ~/.config
            stores = {
              serviceKeyStore: hasServiceKeyStore
                ? new AbapServiceKeyStore(serviceKeysDir, storeLogger)
                : undefined,
              sessionStore: new SafeAbapSessionStore(storeLogger, undefined),
            };
            break;
          case 'btp':
            stores = {
              serviceKeyStore: hasServiceKeyStore
                ? new BtpServiceKeyStore(serviceKeysDir, storeLogger)
                : undefined,
              sessionStore: new SafeBtpSessionStore('', storeLogger),
            };
            break;
        }
      }

      this.sharedStores.set(storeKey, stores);

      logger?.debug('Created shared stores', {
        type: 'SHARED_STORES_CREATED',
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
            stores.serviceKeyStore = new AbapServiceKeyStore(
              serviceKeysDir,
              storeLogger,
            );
            break;
          case 'btp':
            stores.serviceKeyStore = new BtpServiceKeyStore(
              serviceKeysDir,
              storeLogger,
            );
            break;
        }
        logger?.debug('Added serviceKeyStore to existing shared stores', {
          type: 'SERVICE_KEY_STORE_ADDED',
          storeKey,
          storeType,
        });
      }
    }

    const { serviceKeyStore, sessionStore } = stores;
    const destination = serviceKeyDestination || brokerKey;

    // Pre-seed session store with data from service key (without tokens) to avoid stale/absent configs
    if (hasServiceKeyStore && serviceKeyDestination) {
      try {
        logger?.debug('Starting session seed from service key', {
          type: 'SESSION_SEED_START',
          brokerKey,
          serviceKeyDestination,
          hasServiceKeyStore: !!serviceKeyStore,
          hasSessionStore: !!sessionStore,
        });

        const skConn = await serviceKeyStore?.getConnectionConfig?.(
          serviceKeyDestination,
        );
        const skAuth = await serviceKeyStore?.getAuthorizationConfig?.(
          serviceKeyDestination,
        );

        logger?.debug('Service key data retrieved', {
          type: 'SESSION_SEED_DATA_RETRIEVED',
          brokerKey,
          serviceKeyDestination,
          hasConnConfig: !!skConn,
          hasAuthConfig: !!skAuth,
          serviceUrl: skConn?.serviceUrl,
          serviceUrlLength: skConn?.serviceUrl?.length || 0,
        });

        // Only seed connection config if serviceUrl is present
        if (skConn?.serviceUrl && sessionStore?.setConnectionConfig) {
          logger?.debug('Seeding connection config', {
            type: 'SESSION_SEED_CONN_START',
            brokerKey,
            serviceKeyDestination,
            serviceUrl: skConn.serviceUrl.substring(0, 50),
          });
          await sessionStore.setConnectionConfig(serviceKeyDestination, {
            ...skConn,
            authorizationToken: undefined,
          });
          logger?.debug('Session store seeded with connection config', {
            type: 'SESSION_SEED_CONN_SUCCESS',
            brokerKey,
            serviceKeyDestination,
            serviceUrl: skConn.serviceUrl.substring(0, 50),
          });
        } else if (skConn && !skConn.serviceUrl) {
          logger?.debug(
            `Service key for ${serviceKeyDestination} does not contain serviceUrl. Skipping connection config seed.`,
            {
              type: 'SESSION_SEED_SKIP_NO_SERVICE_URL',
              brokerKey,
              serviceKeyDestination,
            },
          );
        } else if (!skConn) {
          logger?.debug(
            `Service key store returned null connection config for ${serviceKeyDestination}`,
            {
              type: 'SESSION_SEED_NO_CONN_CONFIG',
              brokerKey,
              serviceKeyDestination,
            },
          );
        }

        if (skAuth && sessionStore?.setAuthorizationConfig) {
          logger?.debug('Seeding authorization config', {
            type: 'SESSION_SEED_AUTH_START',
            brokerKey,
            serviceKeyDestination,
          });
          await sessionStore.setAuthorizationConfig(
            serviceKeyDestination,
            skAuth,
          );
          logger?.debug('Session store seeded with authorization config', {
            type: 'SESSION_SEED_AUTH_SUCCESS',
            brokerKey,
            serviceKeyDestination,
          });
        } else if (!skAuth) {
          logger?.debug(
            `Service key store returned null authorization config for ${serviceKeyDestination}`,
            {
              type: 'SESSION_SEED_NO_AUTH_CONFIG',
              brokerKey,
              serviceKeyDestination,
            },
          );
        }
      } catch (e) {
        logger?.debug('Failed to seed session store from service key', {
          type: 'SESSION_SEED_FAILED',
          brokerKey,
          serviceKeyDestination,
          error: (e as Error)?.message,
          stack: (e as Error)?.stack,
        });
        // Don't throw - broker will try to get serviceUrl from serviceKeyStore when needed
      }
    } else {
      logger?.debug('Skipping session seed', {
        type: 'SESSION_SEED_SKIPPED',
        brokerKey,
        hasServiceKeyStore,
        serviceKeyDestination,
      });
    }

    const tokenProvider = await this.createTokenProviderForDestination(
      destination,
      storeType,
      sessionStore,
      serviceKeyStore,
      logger,
    );

    // Create AuthBroker
    const authBroker = new AuthBroker(
      {
        serviceKeyStore: hasServiceKeyStore ? serviceKeyStore : undefined,
        sessionStore,
        tokenProvider,
      } as any,
      this.config.browser || 'system',
      brokerLogger,
    );

    this.authBrokers.set(brokerKey, authBroker);

    logger?.debug('AuthBroker created', {
      type: 'AUTH_BROKER_CREATED',
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
    logger: ILogger | undefined,
  ): Promise<void> {
    // Only use specific loggers if DEBUG variables are set, no fallback
    const storeLogger = this.config.storeLogger;
    const providerLogger = this.config.providerLogger;
    const brokerLogger = this.config.brokerLogger;
    // Create EnvFileSessionStore that reads from specified .env file
    const sessionStore = new EnvFileSessionStore(envFilePath, storeLogger);

    // Get auth type from .env file to determine if we need token provider
    const authType = sessionStore.getAuthType();

    if (!authType) {
      throw new Error(
        `Unable to determine auth type from .env file: ${envFilePath}`,
      );
    }

    logger?.debug('Creating broker with EnvFileSessionStore', {
      type: 'ENV_FILE_STORE_CREATE',
      brokerKey,
      envFilePath,
      authType,
    });

    const tokenProvider = await this.createTokenProviderForDestination(
      brokerKey,
      'abap',
      sessionStore,
      undefined,
      providerLogger,
    );

    // Create AuthBroker with EnvFileSessionStore
    const authBroker = new AuthBroker(
      {
        serviceKeyStore: undefined, // No service key store for --env mode
        sessionStore,
        tokenProvider,
      } as any,
      this.config.browser || 'system',
      brokerLogger,
    );

    this.authBrokers.set(brokerKey, authBroker);

    logger?.debug('AuthBroker created with EnvFileSessionStore', {
      type: 'AUTH_BROKER_CREATED_ENV_FILE',
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
    logger: ILogger | undefined,
  ): Promise<'basic' | 'jwt'> {
    if (!fs.existsSync(envFilePath)) {
      throw new Error(`.env file not found: ${envFilePath}`);
    }

    logger?.debug('Loading .env file into session store', {
      type: 'ENV_LOAD_START',
      envFilePath,
      destination,
    });

    // Parse .env file
    const envContent = fs.readFileSync(envFilePath, 'utf8');
    const envVars: Record<string, string> = {};

    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1);

      // Inline comments are intentionally not supported.
      // A '#' is treated as comment only when it starts the line.
      value = value.trim();

      // Remove quotes
      value = value.replace(/^["']+|["']+$/g, '').trim();

      if (key) {
        envVars[key] = value;
      }
    }

    // Validate required fields
    if (!envVars.SAP_URL) {
      throw new Error('.env file missing SAP_URL');
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
        throw new Error(
          '.env file missing SAP_USERNAME or SAP_PASSWORD for basic auth',
        );
      }
      connectionConfig.username = envVars.SAP_USERNAME;
      connectionConfig.password = envVars.SAP_PASSWORD;
    } else if (authType === 'jwt') {
      if (!envVars.SAP_JWT_TOKEN) {
        throw new Error('.env file missing SAP_JWT_TOKEN for JWT auth');
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
      logger?.debug('.env file loaded into session store', {
        type: 'ENV_LOAD_SUCCESS',
        destination,
        serviceUrl: connectionConfig.serviceUrl,
        authType: connectionConfig.authType,
      });
    } else {
      throw new Error('Session store does not support setConnectionConfig');
    }

    if (authType === 'jwt') {
      const hasUaaConfig =
        envVars.SAP_UAA_URL &&
        envVars.SAP_UAA_CLIENT_ID &&
        envVars.SAP_UAA_CLIENT_SECRET;
      if (hasUaaConfig && sessionStore?.setAuthorizationConfig) {
        await sessionStore.setAuthorizationConfig(destination, {
          uaaUrl: envVars.SAP_UAA_URL,
          uaaClientId: envVars.SAP_UAA_CLIENT_ID,
          uaaClientSecret: envVars.SAP_UAA_CLIENT_SECRET,
          refreshToken: envVars.SAP_REFRESH_TOKEN,
        });
      }
    }

    return authType;
  }

  private async createTokenProviderForDestination(
    destination: string,
    storeType: 'abap' | 'btp',
    sessionStore: ISessionStore,
    serviceKeyStore: IServiceKeyStore | undefined,
    logger: ILogger | undefined,
  ): Promise<ITokenProvider> {
    // Use providerLogger only if DEBUG_PROVIDER is set, otherwise undefined (no logging)
    const providerLogger = this.config.providerLogger;
    let authConfig: IAuthorizationConfig | null = null;
    let connConfig: IConnectionConfig | null = null;

    try {
      connConfig = await sessionStore.getConnectionConfig(destination);
    } catch (error) {
      logger?.debug('Failed to read connection config for token provider', {
        destination,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      authConfig = await sessionStore.getAuthorizationConfig(destination);
    } catch (error) {
      logger?.debug('Failed to read auth config from session store', {
        destination,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!authConfig && serviceKeyStore?.getAuthorizationConfig) {
      try {
        authConfig = await serviceKeyStore.getAuthorizationConfig(destination);
      } catch (error) {
        logger?.debug('Failed to read auth config from service key store', {
          destination,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!authConfig) {
      return this.wrapLegacyTokenProvider({
        getTokens: async (): Promise<ITokenResult> => {
          throw new Error(
            `Authorization config is required for destination "${destination}". Provide a service key or session with UAA credentials.`,
          );
        },
      });
    }

    const providerConfig = {
      uaaUrl: authConfig.uaaUrl,
      clientId: authConfig.uaaClientId,
      clientSecret: authConfig.uaaClientSecret,
      refreshToken: authConfig.refreshToken,
      accessToken: connConfig?.authorizationToken,
      browser: this.config.browser || 'system',
      redirectPort: this.config.browserAuthPort,
      logger: providerLogger,
    };

    // For mcp-abap-adt, AuthorizationCodeProvider is the only provider used
    // Both 'abap' and 'btp' store types use AuthorizationCodeProvider
    if (storeType === 'btp' || storeType === 'abap') {
      return this.wrapLegacyTokenProvider(
        new AuthorizationCodeProvider(providerConfig),
      );
    }

    // This should never happen, but throw error for safety
    throw new Error(
      `Unsupported store type "${storeType}" for destination "${destination}". Only 'abap' and 'btp' are supported.`,
    );
  }

  private wrapLegacyTokenProvider(
    tokenProvider: ITokenProvider,
  ): ITokenProvider & {
    getConnectionConfig?: (
      _authConfig: unknown,
      _options?: unknown,
    ) => Promise<{
      connectionConfig: { authorizationToken?: string };
      refreshToken?: string;
    }>;
  } {
    if (typeof tokenProvider.getTokens !== 'function') {
      throw new Error('AuthBrokerFactory: tokenProvider.getTokens is required');
    }
    if (typeof (tokenProvider as any).getConnectionConfig === 'function') {
      return tokenProvider as any;
    }

    const getTokens = tokenProvider.getTokens.bind(tokenProvider);

    return {
      getTokens,
      getConnectionConfig: async () => {
        const tokenResult = await getTokens();
        return {
          connectionConfig: {
            authorizationToken: tokenResult.authorizationToken,
          },
          refreshToken: tokenResult.refreshToken,
        };
      },
    };
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
