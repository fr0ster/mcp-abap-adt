/**
 * Plain-node scenario (`runScenarioOutput`) for `launcherDestination.test.ts`
 * and `auth/jwtNoneLeavesStdio.test.ts`: the stdio launcher run in a process
 * of its own, so the test owns that process's stdout as a client does — the
 * launcher writes nothing there (H3). A spy on a test file's own stdout
 * would sit between node:test's runner and its report (Task 3.1, measured).
 *
 * Arguments: `<directory> <mode> <platform> -- <argv…>`, the environment
 * the test's own. The directory is the case's working directory (its
 * session files and keys); `mode` is
 * - `launch`: the start as the test's `run()` makes it, with the same
 *   stand-in edges (tagged browsers, a recording login strategy, the
 *   server's start and its connection at start replaced);
 * - `login`: the same start with the shipped `browserCallbackStrategy`,
 *   then the destination's broker asked for a token: the authorization URL
 *   is prompted on stderr and the login is ended by the identity
 *   provider's `error=access_denied` with that attempt's `state`.
 * The report — the exits, the stderr lines and the login's end — is the
 * one line this process writes on stdout. Nothing else may reach it.
 */
import { EventEmitter } from 'node:events';
import { mock } from 'node:test';
import {
  type authBroker as AuthBrokerFile,
  type authProviderBrowsers as BrowsersFile,
  PACKAGE_FILES,
} from '../../../../../src/__tests__/helpers/packageFiles';
import {
  recordUnhandled,
  report,
} from '../../../../../src/__tests__/helpers/plainNodeRecorder';

// The module objects themselves (see PACKAGE_FILES): what a mock replaces
// a member of.
const authProviderBrowsers: typeof BrowsersFile = require(
  PACKAGE_FILES.authProviderBrowsers,
);
const authBroker: typeof AuthBrokerFile = require(PACKAGE_FILES.authBroker);

// The shipped browsers are stand-ins tagged with what they were built for,
// as in the test: replaced before the launcher's browser table loads.
const tagged = (factory: string) => (argument?: string) => ({
  open: async () => {},
  built: argument === undefined ? factory : `${factory}(${argument})`,
});
mock.property(
  authProviderBrowsers,
  'linuxDefaultBrowser',
  tagged('linuxDefaultBrowser'),
);
mock.property(authProviderBrowsers, 'linuxBrowser', tagged('linuxBrowser'));

import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import { readConfigFile } from '@mcp-abap-adt/lib/config';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import type { LoginStrategyOptions } from '../../auth';
import { CORE_PARAMETERS, readCoreConfig } from '../../config/coreParameters';
import { launch } from '../../launcher.js';
import { StdioServer } from '../../StdioServer.js';

const REDIRECT = 'http://localhost:61001/callback';
const TEST_OPTIONS = {
  toolSet: fullToolSet,
  program: 'mcp-abap-adt',
  version: '0.0.0-test',
  packageName: '@mcp-abap-adt/core',
};

const recordingStrategy =
  () =>
  (_options: LoginStrategyOptions): IAuthorizationStrategy<string> => ({
    authorize: async (request: AuthorizationRequest) => {
      await request.buildAuthorizationUrl(REDIRECT);
      return { payload: 'code-1', redirectUri: REDIRECT };
    },
  });

async function main(): Promise<void> {
  recordUnhandled();
  const [directory = '', mode = 'launch', platform = 'linux', dash, ...argv] =
    process.argv.slice(2);
  if (dash !== '--') throw new Error('usage');
  process.chdir(directory);
  mock.method(StdioServer.prototype, 'start', async () => undefined);
  mock.method(StdioServer.prototype, 'connectAtStart', async () => ({
    session: 'logged_on',
  }));
  const brokers = mock.method(authBroker, 'AuthBroker');

  process.argv = ['node', 'mcp-abap-adt', ...argv];
  const args = process.argv.slice(2);
  const file = readConfigFile(CORE_PARAMETERS, args);
  const config = readCoreConfig(
    args,
    process.env,
    file.template ? null : file.yaml,
  );
  const stderr: string[] = [];
  const exits: number[] = [];
  await launch(config, TEST_OPTIONS, {
    browserStrategy:
      mode === 'login' ? browserCallbackStrategy : recordingStrategy(),
    stderr: (line) => stderr.push(line),
    exit: (code) => exits.push(code),
    processLike: Object.assign(new EventEmitter(), {
      stdin: new EventEmitter(),
    }),
    platform,
  });

  let loginEnded = false;
  if (mode === 'login') {
    // The URL goes to this process's stderr directly (it carries `state`):
    // read there, as the test reads it, and still written through.
    const written: string[] = [];
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown) => {
      written.push(String(chunk));
      return write(String(chunk));
    }) as typeof process.stderr.write;
    const broker = brokers.mock.calls[0]?.result;
    if (broker === undefined) throw new Error('no broker was built');
    const login = broker.getToken('dest').then(
      () => false,
      () => true,
    );
    const port = argv
      .find((a) => a.startsWith('--browser-auth-port='))
      ?.slice('--browser-auth-port='.length);
    const redirect = `http://localhost:${port}/callback`;
    const said = () => [...written, ...stderr].join('\n');
    for (
      let i = 0;
      i < 100 && !said().includes(encodeURIComponent(redirect));
      i++
    ) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const shown = said();
    const from = shown.indexOf('https://uaa.example.test/oauth/authorize?');
    let to = from;
    while (to >= 0 && to < shown.length && shown[to]?.trim() !== '') to++;
    const state =
      from < 0
        ? ''
        : (new URL(shown.slice(from, to)).searchParams.get('state') ?? '');
    await fetch(`${redirect}?error=access_denied&state=${state}`).catch(
      () => undefined,
    );
    loginEnded = await login;
    process.stderr.write = write;
  }
  report({ exits, stderr, loginEnded });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `the scenario failed: ${error instanceof Error ? `${error.name}: ${error.message}` : 'value'}\n`,
  );
  process.exit(1);
});
