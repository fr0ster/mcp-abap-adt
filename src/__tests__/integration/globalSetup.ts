/**
 * Jest Global Setup for Integration Tests
 *
 * Runs ONCE before all test suites to ensure a valid session exists — in a
 * live run only. The running npm script decides (`npm_lifecycle_event`
 * against `LIVE_SCRIPTS`): a unit run (`npm test`) returns at once, with no
 * realm check, no logon and no run directory.
 *
 * 1. A family run (`npm run test:coverage-family -- <files>`) is refused
 *    unless every selected path is the exact repository path of an existing
 *    integration test file — before anything is read or sent.
 * 2. A live run gets its
 *    run directory under the OS temp directory (`MCP_ABAP_ADT_COVERAGE_RUN`):
 *    the call log, the run report and the refusal marker live there.
 * 3. Without a test config (tests/test-config.yaml, or MCP_TEST_CONFIG) it
 *    returns at once: nothing is built, nothing logs on, no browser opens.
 * 4. With one, the realm check (`realmCheck`) runs before the factory is
 *    built: an unauthenticated discovery `GET` must answer `401` with the
 *    configured realm (on premise), and the session's JWT must not have
 *    expired (cloud).
 * 5. Then it builds the destination's factory and logs on once through a
 *    guarded connection holding the destination's provider (`getProvider`) —
 *    cached token, refresh, or an interactive login — and settles the
 *    factory, which writes the session (unsafe store) for the test suites to
 *    reuse. A credential refusal there latches the run's marker and fails the
 *    setup: nothing is sent after it.
 *
 * Requires: auth_broker.unsafe: true in test-config.yaml
 */

// First, for its effect: the sibling packages below resolve to their sources.
import './helpers/packageSources';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import {
  AuthBrokerFactory,
  browserFor,
  browserOf,
  destinationFailureWords,
  promptLogger,
} from '@mcp-abap-adt/core/auth';
import { RUN_VARIABLE, startRunDirectory } from './coverageReport/reportFormat';
import { connectionTypeOf, destinationFileValue } from './helpers/authHelpers';
import {
  configuredSystemKindOf,
  memberOf,
  sessionVariables,
} from './helpers/configuredSystemKind';
import { isLiveScript } from './helpers/liveScripts';
import { endTestConnection } from './helpers/openConnections';
import { restoreResolution } from './helpers/packageSources';
import { realmCheck } from './helpers/realmCheck';
import {
  credentialRefused,
  guardedSend,
  guardedTestConnection,
} from './helpers/refusalGuard';
import { loadRunConfig } from './helpers/runConfig';
import { runScriptOf } from './helpers/runReport';

/** What the setup reads of Jest's global configuration. */
export interface SetupConfig {
  rootDir: string;
  testPathPatterns: { patterns: readonly string[] };
}

const INTEGRATION_ROOT = 'src/__tests__/integration/';

/**
 * Refuses a family run's selection unless each path is, as a string, the
 * repository path of an existing file under `src/__tests__/integration/`
 * ending `.test.ts`: a directory, a fragment or a pattern is refused, and so
 * is an empty selection.
 */
export function refuseSelection(
  patterns: readonly string[],
  root: string,
): void {
  if (patterns.length === 0) {
    throw new Error(
      'test:coverage-family needs the live test files to run, each by its repository path',
    );
  }
  for (const pattern of patterns) {
    const exact =
      pattern.startsWith(INTEGRATION_ROOT) &&
      pattern.endsWith('.test.ts') &&
      fs.existsSync(path.join(root, pattern));
    if (!exact) {
      throw new Error(
        `test:coverage-family runs exact integration test files only: "${pattern}" is not the repository path of a file under ${INTEGRATION_ROOT} ending .test.ts`,
      );
    }
  }
}

export default async function globalSetup(
  globalConfig: SetupConfig,
): Promise<void> {
  try {
    await setUp(globalConfig);
  } finally {
    restoreResolution();
  }
}

/** A parsed document's string member, trimmed, or `''`. */
const textAt = (value: unknown, ...keys: string[]): string => {
  let at = value;
  for (const key of keys) at = memberOf(at, key);
  return typeof at === 'string' ? at.trim() : '';
};

async function setUp(globalConfig: SetupConfig): Promise<void> {
  // A unit run does no live work at all.
  if (!isLiveScript(process.env.npm_lifecycle_event)) return;
  const script = runScriptOf(process.env.npm_lifecycle_event);
  if (script === 'family') {
    refuseSelection(
      globalConfig.testPathPatterns.patterns,
      globalConfig.rootDir,
    );
  }
  if ((process.env[RUN_VARIABLE] ?? '') === '') startRunDirectory();

  const config = loadRunConfig();
  if (config === undefined || config === null) {
    return;
  }

  const destination =
    textAt(config, 'auth_broker', 'abap', 'destination') ||
    textAt(config, 'abap', 'destination') ||
    textAt(config, 'environment', 'destination');

  if (!destination) {
    return;
  }

  // The kind the logon is built for, stated before anything connects: the
  // config's environment.system_type, else SAP_SYSTEM_TYPE (environment or
  // the session file). None stated refuses the connection before the
  // cached token, the refresh or a login is tried.
  const stated = configuredSystemKindOf(config);
  if (stated === undefined) {
    console.log(
      '[globalSetup] Auth skipped: no system type stated (environment.system_type in the test config, or SAP_SYSTEM_TYPE); nothing was sent to the system',
    );
    return;
  }
  const kind = stated === 'cloud' ? 'cloud' : 'onprem';

  // The realm check, before the factory is built and before any logon.
  const session = sessionVariables(config);
  const baseUrl = session.SAP_URL;
  if (baseUrl === undefined || baseUrl === '') {
    throw new Error(
      `[globalSetup] realm check: the session file of "${destination}" names no SAP_URL; nothing was sent`,
    );
  }
  await realmCheck(
    kind,
    baseUrl,
    textAt(config, 'environment', 'expected_realm'),
    { jwt: session.SAP_JWT_TOKEN },
  );

  const broker = memberOf(config, 'auth_broker');
  const useUnsafe =
    process.env.MCP_UNSAFE === 'true' ||
    memberOf(broker, 'unsafe') === true ||
    memberOf(broker, 'unsafe_session_store') === true;

  if (!useUnsafe) {
    console.log(
      '[globalSetup] WARNING: auth_broker.unsafe is not enabled. Session will not persist to file.',
    );
  }

  const serviceKeysDir = textAt(broker, 'paths', 'service_keys_dir');
  const basePath = serviceKeysDir
    ? path.resolve(
        serviceKeysDir.startsWith('~')
          ? os.homedir() + serviceKeysDir.slice(1)
          : serviceKeysDir,
      )
    : undefined;
  const callbackPort = memberOf(broker, 'browser_auth_port');

  const factory = new AuthBrokerFactory({
    mcpDestination: destination,
    authBrokerPath: basePath,
    unsafe: useUnsafe,
    // The test config's browser word, mapped as the server maps --browser.
    browser: browserOf(
      browserFor(
        { browser: textAt(broker, 'browser') || 'system' },
        process.platform,
      ),
    ),
    ...(callbackPort !== undefined && {
      browserAuthPort: Number(callbackPort),
    }),
    // The wire as the run states it, else as the destination's own file
    // states it (as the launcher reads it); none is refused, naming it.
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
  });

  try {
    const settings = await factory.settingsFor(destination);
    const provider = await guardedSend("the destination's credential", () =>
      factory.getProvider(destination),
    );
    // connect() logs on: cached token → refresh → browser (if needed).
    const connection = guardedTestConnection(settings, provider, { kind });
    await connection.connect();
    console.log(`[globalSetup] Session ready for "${destination}"`);
    await endTestConnection(connection);
  } catch (error: unknown) {
    if (credentialRefused()) {
      // The marker is latched: the run stops here, nothing more is sent.
      throw new Error(
        `[globalSetup] the credential of "${destination}" was refused: ${destinationFailureWords(error, destination)}`,
      );
    }
    console.log(
      `[globalSetup] Auth failed: ${destinationFailureWords(error, destination)}`,
    );
    // Not a credential refusal: the tests handle missing auth (skip).
  } finally {
    // Writes the session the login produced (unsafe store).
    const report = await factory.settle();
    if (report.notStored.length > 0) {
      console.log(
        `[globalSetup] Session not stored: ${report.notStored.join(', ')}`,
      );
    }
  }
}
