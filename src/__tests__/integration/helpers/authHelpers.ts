/**
 * Authentication helpers for integration tests
 * Uses AuthBrokerFactory for the configured destination: its settings and
 * its provider, the same two things the server's transports use.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import {
  AuthBrokerFactory,
  browserFor,
  browserOf,
  promptLogger,
} from '@mcp-abap-adt/core/auth';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  DefaultLogger,
  defaultLogger,
  getLogLevel,
} from '@mcp-abap-adt/logger';
import * as dotenv from 'dotenv';
import { getPlatformPaths } from '../../../../server-runtime/src/stdio/config/platformPaths';
import { loadTestConfig } from './configHelpers';
import { createTestLogger } from './loggerHelpers';
import { guardedSend } from './refusalGuard';

const authLogger = createTestLogger('auth');

/**
 * Create logger for stores based on DEBUG_STORES or DEBUG_AUTH_STORES environment variable
 * Returns DefaultLogger from @mcp-abap-adt/logger if enabled, undefined otherwise
 */
export function createStoreLogger(): ILogger | undefined {
  const isEnabled = (): boolean => {
    if (
      process.env.DEBUG_STORES === 'false' ||
      process.env.DEBUG_AUTH_STORES === 'false'
    ) {
      return false;
    }
    if (
      process.env.DEBUG_STORES === 'true' ||
      process.env.DEBUG_AUTH_STORES === 'true' ||
      process.env.DEBUG === 'true' ||
      process.env.DEBUG?.includes('stores') === true ||
      process.env.DEBUG?.includes('auth-stores') === true
    ) {
      return true;
    }
    return false;
  };

  if (isEnabled()) {
    return new DefaultLogger(getLogLevel());
  }

  return undefined;
}

/**
 * Create logger for provider based on DEBUG_PROVIDER or DEBUG_AUTH_PROVIDERS environment variable
 * Returns DefaultLogger from @mcp-abap-adt/logger if enabled, undefined otherwise
 */
export function createProviderLogger(): ILogger | undefined {
  const isEnabled = (): boolean => {
    if (
      process.env.DEBUG_PROVIDER === 'false' ||
      process.env.DEBUG_AUTH_PROVIDERS === 'false'
    ) {
      return false;
    }
    if (
      process.env.DEBUG_PROVIDER === 'true' ||
      process.env.DEBUG_AUTH_PROVIDERS === 'true' ||
      process.env.DEBUG === 'true' ||
      process.env.DEBUG?.includes('provider') === true ||
      process.env.DEBUG?.includes('auth-providers') === true
    ) {
      return true;
    }
    return false;
  };

  if (isEnabled()) {
    return new DefaultLogger(getLogLevel());
  }

  return undefined;
}

/**
 * Create logger for broker based on DEBUG_BROKER or DEBUG_AUTH_BROKER environment variable
 * Returns DefaultLogger from @mcp-abap-adt/logger if enabled, undefined otherwise
 */
export function createBrokerLogger(): ILogger | undefined {
  const isEnabled = (): boolean => {
    if (
      process.env.DEBUG_BROKER === 'false' ||
      process.env.DEBUG_AUTH_BROKER === 'false'
    ) {
      return false;
    }
    if (
      process.env.DEBUG_BROKER === 'true' ||
      process.env.DEBUG_AUTH_BROKER === 'true' ||
      process.env.DEBUG === 'true' ||
      process.env.DEBUG?.includes('broker') === true ||
      process.env.DEBUG?.includes('auth-broker') === true
    ) {
      return true;
    }
    return false;
  };

  if (isEnabled()) {
    return new DefaultLogger(getLogLevel());
  }

  return undefined;
}

/**
 * Create logger for connection based on DEBUG_CONNECTION, DEBUG_CONN, or DEBUG_CONNECTORS environment variable
 * Returns DefaultLogger from @mcp-abap-adt/logger if enabled, undefined otherwise
 */
export function createConnectionLogger(): ILogger | undefined {
  const isEnabled = (): boolean => {
    if (
      process.env.DEBUG_CONNECTION === 'false' ||
      process.env.DEBUG_CONN === 'false' ||
      process.env.DEBUG_CONNECTORS === 'false'
    ) {
      return false;
    }
    if (
      process.env.DEBUG_CONNECTION === 'true' ||
      process.env.DEBUG_CONN === 'true' ||
      process.env.DEBUG_CONNECTORS === 'true' ||
      process.env.DEBUG === 'true' ||
      process.env.DEBUG?.includes('connection') === true ||
      process.env.DEBUG?.includes('conn') === true ||
      process.env.DEBUG?.includes('connectors') === true
    ) {
      return true;
    }
    return false;
  };

  if (isEnabled()) {
    return new DefaultLogger(getLogLevel());
  }

  return undefined;
}

/** The configured destination, as a connection needs it. */
export interface TestDestination {
  destination: string;
  factory: AuthBrokerFactory;
  settings: SapConfig;
  credential: IAuthProvider;
}

/** The destination the test config names, or undefined. */
/**
 * `key` as the destination's own `sessions/<destination>.env` states it (the
 * file the launcher joins to the environment for the wire), when readable.
 */
export function destinationFileValue(
  basePath: string | undefined,
  destination: string,
  key: string,
): string | undefined {
  const sessions = getPlatformPaths(basePath, 'sessions')[0];
  if (sessions === undefined) return undefined;
  try {
    return dotenv.parse(
      fs.readFileSync(path.join(sessions, `${destination}.env`), 'utf8'),
    )[key];
  } catch {
    return undefined;
  }
}

/** `SAP_CONNECTION_TYPE` as the factory takes it; absent unless one of the two. */
export function connectionTypeOf(stated: string | undefined): {
  connectionType?: 'http' | 'rfc';
} {
  const word = stated?.trim().toLowerCase();
  return word === 'http' || word === 'rfc' ? { connectionType: word } : {};
}

function configuredDestination(config: any): string | undefined {
  return (
    config?.auth_broker?.abap?.destination ||
    config?.abap?.destination ||
    config?.environment?.destination ||
    undefined
  );
}

/**
 * The factory for the test config's destination: its stores under
 * `auth_broker.paths.service_keys_dir`, its interactive login through the
 * browser strategy (opened only when the destination needs a login).
 */
export function createTestFactory(
  config: any,
  destination: string,
): AuthBrokerFactory {
  // service_keys_dir is ALWAYS a base path - factory adds service-keys/sessions
  const serviceKeysDir = config?.auth_broker?.paths?.service_keys_dir;
  const basePath = serviceKeysDir
    ? path.resolve(serviceKeysDir.replace(/^~/, require('node:os').homedir()))
    : undefined;
  const useUnsafe =
    process.env.MCP_UNSAFE === 'true' ||
    config?.auth_broker?.unsafe === true ||
    config?.auth_broker?.unsafe_session_store === true;

  return new AuthBrokerFactory({
    mcpDestination: destination,
    authBrokerPath: basePath,
    unsafe: useUnsafe,
    // The test config's browser word, mapped as the server maps --browser.
    browser: browserOf(
      browserFor(
        { browser: config?.auth_broker?.browser ?? 'system' },
        process.platform,
      ),
    ),
    ...(config?.auth_broker?.browser_auth_port !== undefined && {
      browserAuthPort: Number(config.auth_broker.browser_auth_port),
    }),
    // The wire as the run states it; none stated is refused by the factory,
    // naming SAP_CONNECTION_TYPE.
    ...connectionTypeOf(
      process.env.SAP_CONNECTION_TYPE ??
        destinationFileValue(basePath, destination, 'SAP_CONNECTION_TYPE'),
    ),
    browserStrategy: browserCallbackStrategy,
    // A login's prompts reach the person running the tests, on stderr.
    promptLogger: promptLogger((line) => process.stderr.write(`${line}\n`), {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }),
    // Only when DEBUG_BROKER is set — no default logger
    logger: createBrokerLogger(),
  });
}

let testDestinationPromise: Promise<TestDestination | null> | undefined;

/**
 * The test config's destination — one factory per process, so every test
 * suite in it shares the destination's one provider. `null` when the config
 * names no destination.
 */
export function getTestDestination(): Promise<TestDestination | null> {
  if (!testDestinationPromise) {
    testDestinationPromise = (async () => {
      const config = loadTestConfig();
      const destination = configuredDestination(config);
      if (!destination) return null;
      const factory = createTestFactory(config, destination);
      const settings = await factory.settingsFor(destination);
      // A broker's refusal latches the run's marker (refusalGuard).
      const credential = await guardedSend("the destination's credential", () =>
        factory.getProvider(destination),
      );
      return { destination, factory, settings, credential };
    })();
    testDestinationPromise.catch(() => {
      testDestinationPromise = undefined;
    });
  }
  return testDestinationPromise;
}

/**
 * Make the configured destination available to the tests through
 * process.env, by its wire: over HTTP its URL and client (SAP_URL,
 * SAP_CLIENT); over RFC its stated address, client and language
 * (SAP_ASHOST / SAP_SYSNR or the message-server keys, SAP_SAPROUTER,
 * SAP_CLIENT, SAP_LANGUAGE) and no SAP_URL — an RFC destination has none.
 * The credential stays in the provider — there is no token to copy; a
 * connection gets it from `getTestDestination()`. Answers whether a
 * destination was set up.
 * - If destination is specified → use the factory
 * - If destination is not specified → skip (tests will use .env directly)
 */
export async function setupAuthBrokerForTests(_options?: {
  force?: boolean;
}): Promise<boolean> {
  try {
    const target = await getTestDestination();
    if (!target) {
      authLogger?.debug(
        '[setupAuthBrokerForTests] No destination found, skipping (tests will use .env)',
      );
      return false;
    }
    exportSettings(target.settings);
    return true;
  } catch (error: any) {
    authLogger?.warn(
      `[setupAuthBrokerForTests] Failed: ${error?.message || String(error)}`,
    );
    return false;
  }
}

/** `settings` into process.env, per wire (see `setupAuthBrokerForTests`). */
export function exportSettings(settings: SapConfig): void {
  if (settings.connectionType === 'rfc') {
    delete process.env.SAP_URL;
    process.env.SAP_CONNECTION_TYPE = 'rfc';
    const stated: Array<[string, string | undefined]> = [
      ['SAP_ASHOST', settings.ashost],
      ['SAP_SYSNR', settings.sysnr],
      ['SAP_MSHOST', settings.mshost],
      ['SAP_MSSERV', settings.msserv],
      ['SAP_SYSID', settings.sysid],
      ['SAP_GROUP', settings.group],
      ['SAP_SAPROUTER', settings.saprouter],
      ['SAP_CLIENT', settings.client],
      ['SAP_LANGUAGE', settings.language],
    ];
    for (const [name, value] of stated) {
      if (value !== undefined) process.env[name] = value;
    }
    return;
  }
  process.env.SAP_URL = settings.url;
  if (settings.client) process.env.SAP_CLIENT = settings.client;
}
