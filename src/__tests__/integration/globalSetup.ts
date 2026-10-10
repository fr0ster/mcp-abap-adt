/**
 * Jest Global Setup for Integration Tests
 *
 * Runs ONCE before all test suites to ensure a valid session exists.
 * Without a test config (tests/test-config.yaml, or MCP_TEST_CONFIG) it
 * returns at once: nothing is built, nothing logs on, no browser opens.
 *
 * With one, it builds the destination's factory and logs on once through a
 * connection holding the destination's provider (`getProvider`) — cached
 * token, refresh, or an interactive login — then settles the factory, which
 * writes the session (unsafe store) for the test suites to reuse.
 *
 * Requires: auth_broker.unsafe: true in test-config.yaml
 */

// First, for its effect: the sibling packages below resolve to their sources.
import './helpers/packageSources';
import * as path from 'node:path';
import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import { AuthBrokerFactory } from '@mcp-abap-adt/core/auth';
import { describeAuthError } from '../../lib/auth/errors';
import { createAbapConnection } from '../../lib/connectionFactory';
import { restoreResolution } from './helpers/packageSources';
import { testConfigPathFromEnv } from './helpers/testConfigPath';

function loadTestConfig(): any {
  // MCP_TEST_CONFIG names the file for this run; resolved in one place with
  // loadTestConfig, which lives one directory deeper than this file.
  const chosen = testConfigPathFromEnv();
  const configPaths = chosen
    ? [chosen]
    : [
        path.resolve(process.cwd(), 'tests', 'test-config.yaml'),
        path.resolve(__dirname, '../../../../tests/test-config.yaml'),
      ];
  for (const configPath of configPaths) {
    try {
      const fs = require('node:fs');
      const yaml = require('js-yaml');
      const content = fs.readFileSync(configPath, 'utf8');
      return yaml.load(content);
    } catch {
      // try next
    }
  }
  return null;
}

export default async function globalSetup(): Promise<void> {
  try {
    await setUp();
  } finally {
    restoreResolution();
  }
}

async function setUp(): Promise<void> {
  const config = loadTestConfig();
  if (!config) {
    return;
  }

  const destination =
    config?.auth_broker?.abap?.destination ||
    config?.abap?.destination ||
    config?.environment?.destination;

  if (!destination) {
    return;
  }

  const useUnsafe =
    process.env.MCP_UNSAFE === 'true' ||
    config?.auth_broker?.unsafe === true ||
    config?.auth_broker?.unsafe_session_store === true;

  if (!useUnsafe) {
    console.log(
      '[globalSetup] WARNING: auth_broker.unsafe is not enabled. Session will not persist to file.',
    );
  }

  const serviceKeysDir = config?.auth_broker?.paths?.service_keys_dir;
  const basePath = serviceKeysDir
    ? path.resolve(serviceKeysDir.replace(/^~/, require('node:os').homedir()))
    : undefined;

  const factory = new AuthBrokerFactory({
    mcpDestination: destination,
    authBrokerPath: basePath,
    unsafe: useUnsafe,
    browser: config?.auth_broker?.browser ?? 'system',
    ...(config?.auth_broker?.browser_auth_port !== undefined && {
      browserAuthPort: Number(config.auth_broker.browser_auth_port),
    }),
    ...(process.env.SAP_CONNECTION_TYPE?.trim().toLowerCase() === 'rfc' && {
      connectionType: 'rfc' as const,
    }),
    browserStrategy: ({ browser, port }) =>
      browserCallbackStrategy({
        browser,
        ...(port !== undefined && { port }),
      }),
  });

  try {
    const settings = await factory.settingsFor(destination);
    const provider = await factory.getProvider(destination);
    // connect() logs on: cached token → refresh → browser (if needed).
    const connection = createAbapConnection(settings, provider);
    await connection.connect();
    console.log(`[globalSetup] Session ready for "${destination}"`);
    await (connection as { disconnect?: () => Promise<void> }).disconnect?.();
  } catch (error: unknown) {
    console.log(
      `[globalSetup] Auth failed: ${
        describeAuthError(error) ??
        (error instanceof Error ? error.constructor.name : typeof error)
      }`,
    );
    // Don't throw — let tests handle missing auth gracefully (skip)
  } finally {
    // Writes the session the login produced (unsafe store).
    const report = await factory.settle(30_000);
    if (report.notStored.length > 0) {
      console.log(
        `[globalSetup] Session not stored: ${report.notStored.join(', ')}`,
      );
    }
  }
}
