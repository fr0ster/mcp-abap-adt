/**
 * AuthBrokerFactory — one broker per destination, built on first use.
 *
 * Building a destination's broker decides three things, each before anything
 * is built: is what the destination states well formed (`vetMeans`), is
 * there a handler for it (`handlerFor`), and then the broker with exactly the
 * destination's stores and that handler's options. A failure reaches the
 * caller as the error it is.
 *
 * Its providers are handed out counted, behind one gate: `settle` closes the
 * gate, waits for the calls already running, then flushes every broker.
 */

import { AuthBroker, DestinationConfigError } from '@mcp-abap-adt/auth-broker';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { getPlatformPaths } from '../stores/platformPaths';
import { countedProvider, ProviderGate } from './countedProvider';
import { assertDestinationName } from './destinationName';
import {
  type DestinationMode,
  type DestinationStores,
  storesFor,
} from './destinationStores';
import { SettingsError } from './errors';
import {
  type AuthenticationHandler,
  type AuthHandlerContext,
  handlerFor,
} from './handlers';
import type { IAuthBrokerFactory, SettleReport } from './IAuthBrokerFactory.js';
import type { IAuthBrokerFactoryConfig } from './IAuthBrokerFactoryConfig.js';
import { LoginLock } from './loginLock';
import { type VettedAuthentication, vetMeans } from './vocabulary';

/** The destination an `--env` file is served as. */
const ENV_FILE_DESTINATION = 'default';

interface Built {
  broker: AuthBroker;
  handler: AuthenticationHandler;
  vetted: VettedAuthentication;
  stores: DestinationStores;
}

/** A thrown value's class, never its message. */
function classOf(error: unknown): string {
  if (error instanceof Error) {
    const name = error.constructor?.name;
    return name && /^[A-Za-z_$][\w$]*$/.test(name) ? name : 'Error';
  }
  return typeof error;
}

const ENTRY = /^"[^"\n]*": [A-Za-z_$][\w$]*$/;

/**
 * A rejecting `flush()` as `"<destination>": <ErrorClass>` lines: the
 * broker's `AggregateError` entries when they have that shape, else the
 * destination and the class of what was thrown.
 */
function notStoredOf(destination: string, error: unknown): string[] {
  if (error instanceof AggregateError) {
    const lines = error.errors.map((entry: unknown) =>
      entry instanceof Error && ENTRY.test(entry.message)
        ? entry.message
        : `"${destination}": ${classOf(entry)}`,
    );
    if (lines.length > 0) return lines;
  }
  return [`"${destination}": ${classOf(error)}`];
}

export class AuthBrokerFactory implements IAuthBrokerFactory {
  readonly defaultDestination: string | undefined;

  private readonly config: IAuthBrokerFactoryConfig;
  private readonly context: AuthHandlerContext;
  private readonly gate = new ProviderGate();
  /** The build of each destination, set before its first await. */
  private readonly built = new Map<string, Promise<Built>>();
  private readonly providers = new Map<string, Promise<IAuthProvider>>();

  constructor(config: IAuthBrokerFactoryConfig) {
    this.config = config;
    this.defaultDestination =
      config.mcpDestination ??
      (config.envFilePath ? ENV_FILE_DESTINATION : undefined);
    this.context = {
      browser: config.browser,
      ...(config.browserAuthPort !== undefined && {
        browserAuthPort: config.browserAuthPort,
      }),
      loginLock: new LoginLock(),
      browserStrategy: config.browserStrategy,
    };
  }

  async getBroker(destination: string): Promise<AuthBroker> {
    return (await this.buildOf(destination)).broker;
  }

  async settingsFor(destination: string): Promise<SapConfig> {
    const { broker, handler, vetted, stores } = await this.buildOf(destination);
    const means = await broker.getConnectionConfig(destination);
    // An XSUAA destination's URL is XSUAA_MCP_URL alone, never the key's url.
    const url = (await stores.urlStore.getConnectionConfig(destination))
      ?.serviceUrl;
    if (!url) {
      throw new DestinationConfigError(
        destination,
        [stores.urlKey],
        'the destination states no system URL',
      );
    }
    const settings: SapConfig = {
      url,
      ...(means?.sapClient ? { client: means.sapClient } : {}),
      authType: vetted.authType,
      ...(this.config.connectionType
        ? { connectionType: this.config.connectionType }
        : {}),
    };
    try {
      handler.checkSettings?.(settings);
    } catch (error) {
      if (error instanceof SettingsError) {
        throw new DestinationConfigError(
          destination,
          [error.setting],
          'its authentication cannot use these settings',
        );
      }
      throw error;
    }
    return settings;
  }

  getProvider(destination: string): Promise<IAuthProvider> {
    const cached = this.providers.get(destination);
    if (cached) return cached;
    const provider = (async () => {
      const broker = await this.getBroker(destination);
      return countedProvider(await broker.getProvider(destination), this.gate);
    })();
    this.providers.set(destination, provider);
    provider.catch(() => {
      if (this.providers.get(destination) === provider) {
        this.providers.delete(destination);
      }
    });
    return provider;
  }

  async settle(deadlineMs: number): Promise<SettleReport> {
    // Closed first, before any await: a 401 answered from here on gets the
    // shutdown refusal instead of a renewal that would land after the flush.
    this.gate.close();
    const abandoned = await this.gate.drained(deadlineMs);
    const builds = await Promise.allSettled(
      [...this.built.entries()].map(async ([destination, build]) => ({
        destination,
        built: await build,
      })),
    );
    const notStored: string[] = [];
    await Promise.all(
      builds.map(async (outcome) => {
        if (outcome.status !== 'fulfilled') return;
        const { destination, built } = outcome.value;
        try {
          await built.broker.flush();
        } catch (error) {
          notStored.push(...notStoredOf(destination, error));
        }
      }),
    );
    return { abandoned, notStored };
  }

  /** The build of a destination, cached as a promise; a failed one is dropped. */
  private buildOf(destination: string): Promise<Built> {
    try {
      // Before any file is touched: the name is joined into keysDir/sessionsDir.
      assertDestinationName(destination, 'destination');
    } catch (error) {
      return Promise.reject(error);
    }
    const cached = this.built.get(destination);
    if (cached) return cached;
    const build = this.build(destination);
    this.built.set(destination, build);
    build.catch(() => {
      if (this.built.get(destination) === build) {
        this.built.delete(destination);
      }
    });
    return build;
  }

  private async build(destination: string): Promise<Built> {
    const stores = storesFor(this.modeOf(destination), this.config.logger);
    const means = await stores.serviceKeyStore.getConnectionConfig(destination);
    const vetted = vetMeans(destination, means);
    const handler = handlerFor(destination, vetted);
    const broker = new AuthBroker(
      {
        serviceKeyStore: stores.serviceKeyStore,
        sessionStore: stores.sessionStore,
        ...handler.brokerOptions(this.context),
      },
      this.config.logger,
    );
    return { broker, handler, vetted, stores };
  }

  private modeOf(destination: string): DestinationMode {
    const { envFilePath } = this.config;
    if (envFilePath && destination === ENV_FILE_DESTINATION) {
      return {
        kind: 'envFile',
        path: envFilePath,
        source: this.config.envFileSource ?? '--env',
      };
    }
    return {
      kind: 'named',
      name: destination,
      keysDir: getPlatformPaths(this.config.authBrokerPath, 'service-keys')[0],
      sessionsDir: getPlatformPaths(this.config.authBrokerPath, 'sessions')[0],
      unsafe: this.config.unsafe,
    };
  }
}
