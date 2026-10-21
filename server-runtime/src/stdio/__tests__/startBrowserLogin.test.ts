/**
 * stdio: the shutdown while the start's browser login is still open. The
 * client closes stdin while the login waits for its callback (no answer
 * from the user): the start fails — exit 1 once, never 0, with the
 * shutdown-before-start line on stderr — the transport never opens, and the
 * login's callback port is free.
 *
 * The whole launcher, against the ADT stand-in and a token endpoint
 * stand-in; the destination an env file (`default`) with a jwt
 * authorization-code login. The browser is the test's fake (it records the
 * URL and plays no user): nothing launches a browser or a program.
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { browserCallbackStrategy } from '@mcp-abap-adt/auth-providers';
import { fullToolSet } from '@mcp-abap-adt/lib/tool-set';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  type AdtStandIn,
  adtStandIn,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { resetProcessLatchForTests } from '../../../../src/lib/activeTools';
import { readCoreConfig } from '../config/coreParameters';
import { launch } from '../launcher.js';
import { SHUTDOWN_BEFORE_START_LINE } from '../shutdown.js';
import {
  bindsFree,
  type FakeBrowser,
  fakeBrowser,
  type TokenEndpoint,
  tokenEndpoint,
} from './helpers/loginStand';

jest.setTimeout(30_000);

/** What the exit stub throws: execution stops at the first exit. */
const EXITED = Symbol('exited');

let root: string;
let envFile: string;
let adt: AdtStandIn;
let tokens: TokenEndpoint;
let browser: FakeBrowser;
const savedEnv = { ...process.env };

beforeEach(async () => {
  resetProcessLatchForTests();
  process.env.NO_PROXY = '127.0.0.1,localhost';
  process.env.no_proxy = '127.0.0.1,localhost';
  for (const name of [
    'SAP_SYSTEM_TYPE',
    'SAP_CONNECTION_TYPE',
    'MCP_ENV_PATH',
  ]) {
    delete process.env[name];
  }
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'start-')));
  adt = await adtStandIn();
  tokens = await tokenEndpoint();
  browser = fakeBrowser();
  // The user never answers: the login stays open until the shutdown.
  browser.answering(false);
  envFile = path.join(root, 'start.env');
  fs.writeFileSync(
    envFile,
    [
      `SAP_URL=${adt.url}`,
      'SAP_CLIENT=100',
      'SAP_AUTH_TYPE=jwt',
      'SAP_GRANT_TYPE=authorization_code',
      `SAP_UAA_URL=${tokens.url}`,
      'SAP_UAA_CLIENT_ID=client-id',
      'SAP_UAA_CLIENT_SECRET=client-secret',
      '',
    ].join('\n'),
  );
});

afterEach(async () => {
  await tokens.close();
  await adt.close();
  fs.rmSync(root, { recursive: true, force: true });
  process.env = { ...savedEnv };
  jest.restoreAllMocks();
});

it.each<['end' | 'close']>([['end'], ['close']])(
  'stdin %s while the start is in its browser login: exit 1 once, never 0, the start-failed line, the transport never opens, the callback port free',
  async (event) => {
    const config = {
      ...readCoreConfig(
        [
          `--env-path=${envFile}`,
          `--auth-broker-path=${root}`,
          '--system-type=cloud',
        ],
        process.env,
        null,
      ),
      // An ephemeral callback port (no flag reads 0): the browser names it.
      browserAuthPort: 0,
    };
    const [, serverSide] = InMemoryTransport.createLinkedPair();
    let opened = 0;
    const open = serverSide.start.bind(serverSide);
    serverSide.start = async () => {
      opened += 1;
      return open();
    };
    const stderr: string[] = [];
    const exits: number[] = [];
    const processLike = Object.assign(new EventEmitter(), {
      stdin: new EventEmitter(),
    });
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const launched = launch(
      config,
      {
        toolSet: fullToolSet,
        program: 'mcp-abap-adt',
        version: '0.0.0-test',
        packageName: '@mcp-abap-adt/core',
      },
      {
        // The program's strategy, with the test's browser in place of the
        // platform's: nothing is launched.
        browserStrategy: (options) =>
          browserCallbackStrategy({ ...options, browser: browser.browser }),
        stderr: (line) => stderr.push(line),
        // A real exit ends the process at its first call: this one stops
        // the caller there too, so a later exit cannot hide the first.
        exit: (code) => {
          exits.push(code);
          throw EXITED;
        },
        processLike,
        platform: 'linux',
        transport: serverSide,
      },
    ).catch((error: unknown) => {
      if (error !== EXITED) throw error;
    });

    // The login is open: the browser was given its URL, the callback listens.
    await browser.opened(1);
    const port = browser.ports[0] ?? 0;
    expect(port).toBeGreaterThan(0);
    await expect(bindsFree(port)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    });

    processLike.stdin.emit(event);
    const end = Date.now() + 10_000;
    while (exits.length === 0 && Date.now() < end) {
      await new Promise((r) => setTimeout(r, 5));
    }
    // Long enough for a second exit, were there one, to be recorded.
    await new Promise((r) => setTimeout(r, 50));

    expect(exits).toEqual([1]);
    expect(stderr).toContain(SHUTDOWN_BEFORE_START_LINE);
    expect(opened).toBe(0);
    // The login ended with the start: its callback port binds again.
    await bindsFree(port);
    await launched;
  },
);
