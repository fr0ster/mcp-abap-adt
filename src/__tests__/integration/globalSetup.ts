/**
 * Jest Global Setup for Integration Tests
 *
 * Runs ONCE before all test suites to ensure a valid session exists.
 * Authenticates via AuthBroker and writes tokens to the session file (unsafe store).
 * All subsequent test suites read the fresh token from the file — no browser needed.
 *
 * Requires: auth_broker.unsafe: true in test-config.yaml
 */

import * as path from 'node:path';
import { AuthBrokerFactory } from '../../lib/auth/brokerFactory';

function loadTestConfig(): any {
  const configPaths = [
    path.resolve(process.cwd(), 'tests', 'test-config.yaml'),
    path.resolve(__dirname, '../../../../tests/test-config.yaml'),
  ];
  for (const configPath of configPaths) {
    try {
      const fs = require('node:fs');
      const yaml = require('yaml');
      const content = fs.readFileSync(configPath, 'utf8');
      return yaml.parse(content);
    } catch {
      // try next
    }
  }
  return null;
}

export default async function globalSetup(): Promise<void> {
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

  try {
    const factory = new AuthBrokerFactory({
      defaultMcpDestination: destination,
      defaultDestination: destination,
      authBrokerPath: basePath,
      unsafe: useUnsafe,
      transportType: 'stdio',
      useAuthBroker: true,
      browserAuthPort:
        config?.auth_broker?.browser_auth_port ??
        30000 + Math.floor(Math.random() * 10000),
      browser: 'system',
    });

    const authBroker = await factory.getOrCreateAuthBroker(destination);
    if (!authBroker) {
      console.log(
        `[globalSetup] Failed to create AuthBroker for "${destination}"`,
      );
      return;
    }

    // This triggers the full auth flow: cached token → refresh → browser (if needed)
    // With unsafe store, the result is saved to the session file
    const token = await authBroker.getToken(destination);
    if (token) {
      console.log(
        `[globalSetup] Session ready for "${destination}" (token: ${token.substring(0, 20)}...)`,
      );
    } else {
      console.log(`[globalSetup] No token obtained for "${destination}"`);
    }
  } catch (error: any) {
    console.log(
      `[globalSetup] Auth failed: ${error?.message || String(error)}`,
    );
    // Don't throw — let tests handle missing auth gracefully (skip)
  }
}
