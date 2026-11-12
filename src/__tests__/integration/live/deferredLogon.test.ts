/**
 * stdio without its SAP system at the start (fr0ster/mcp-abap-adt#353).
 *
 * **Where it runs.** Only under its live script,
 * `npm run test:live-deferred-logon` (one file at a time; never in
 * `npm test`). For this script the live run's setup checks no realm and
 * logs on nowhere, whatever test config is present (`sharesLiveLogon`,
 * `liveScripts.ts`; pinned by `liveScripts.test.ts`): nothing here needs a
 * system but the real-system cases, which log on only through their own
 * variables and skip with the reason elsewhere.
 *
 * **The closed-port case** reaches no system: the installed bin, started
 * with `--deferred-logon` against a loopback port the case bound and closed,
 * stays up, lists its tools, and answers each call `no_connection`
 * (`ECONNREFUSED`), naming no address; the shutdown exits 0, and stdout
 * holds JSON-RPC frames only.
 *
 * **The real-system cases** run only where `MCP_LIVE_DEFERRED_ENV_PATH`
 * names one HTTP `.env` of a real on-premise system (and, for the take-up,
 * `MCP_LIVE_DEFERRED_LOCK_CLASS` a class of the test user's): the system
 * becomes reachable mid-session (a TCP forwarder on a port of the case's,
 * closed, then opened), and the first call of a `--restore-session` process
 * takes up the session a killed process left, unlocking with its handle.
 *
 * **The RFC case** reaches no system: its host is the reserved name
 * `unreachable.invalid`, which never resolves, and its credentials exist
 * nowhere. It needs `@mcp-abap-adt/sap-rfc-lite` and the SAP NW RFC library,
 * and skips, saying so, where they do not load. It asserts what a tool call
 * answers when the RFC logon cannot reach its system: the RFC key, and no
 * host.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { IAuthorizationStrategy } from '@mcp-abap-adt/interfaces-auth';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as dotenv from 'dotenv';
import { AuthBrokerFactory } from '../../../../server-runtime/src/stdio/auth/brokerFactory';
import { readCoreConfig } from '../../../../server-runtime/src/stdio/config/coreParameters';
import { factoryConfigFrom } from '../../../../server-runtime/src/stdio/launcher';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { fullToolSet, registryOf } from '../../../lib/toolSet';
import {
  installedFile,
  installPackedRelease,
} from '../../helpers/installedRelease';
import { type TakeUpServer, takeUpCase } from '../helpers/takeUpCase';
import { launchStdioScript, McpSession } from '../helpers/testers/hardMode';

/** The reserved name that never resolves (RFC 2606): no system is behind it. */
const UNREACHABLE_HOST = 'unreachable.invalid';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

/** Nothing opens a browser here. */
const noBrowser = (): IAuthorizationStrategy<string> => ({
  authorize: async () => {
    throw new Error('this suite opens no browser login');
  },
  dispose: async () => {},
});

/** Why the RFC case cannot run here, or undefined when the binding loads. */
function rfcUnavailable(): string | undefined {
  try {
    require('@mcp-abap-adt/sap-rfc-lite');
    return undefined;
  } catch {
    return '@mcp-abap-adt/sap-rfc-lite or the SAP NW RFC library did not load (SAPNWRFC_HOME, the library search path)';
  }
}

const rfcSkip = rfcUnavailable();

describe('an RFC tool call against an unreachable system', () => {
  let dir: string;
  const saved = { ...process.env };

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'deferred-rfc-'));
  });

  after(() => {
    process.env = { ...saved };
    rmSync(dir, { recursive: true, force: true });
  });

  it('answers the RFC key, and no host', {
    skip: rfcSkip ?? false,
  }, async () => {
    const envFile = join(dir, 'unreachable.env');
    writeFileSync(
      envFile,
      [
        'SAP_AUTH_TYPE=basic',
        'SAP_CONNECTION_TYPE=rfc',
        `SAP_ASHOST=${UNREACHABLE_HOST}`,
        'SAP_SYSNR=00',
        'SAP_CLIENT=001',
        'SAP_LANGUAGE=EN',
        'SAP_USERNAME=NOBODY',
        'SAP_PASSWORD=nothing-anywhere',
        '',
      ].join('\n'),
    );
    // The connector reads both from the environment, as the launcher sets them.
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    process.env.SAP_CONNECTION_TYPE = 'rfc';
    const config = readCoreConfig(
      [
        `--env-path=${envFile}`,
        `--auth-broker-path=${dir}`,
        '--system-type=onprem',
        '--connection-type=rfc',
      ],
      process.env,
      null,
    );
    const factory = new AuthBrokerFactory(
      factoryConfigFrom(config, {
        browserStrategy: noBrowser,
        promptLogger: silent,
        logger: silent,
      }),
    );
    const destination = factory.defaultDestination;
    assert.equal(destination, 'default');
    const server = new StdioServer(
      registryOf(fullToolSet, 'stdio', { dataTools: false }),
      factory,
      {
        version: '0.0.0-test',
      },
    );
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    // The first tool call makes the connection (no connectAtStart).
    await server.start(destination, serverSide);
    // A session with no timer of its own (launchSites.test.ts).
    const session = new McpSession(clientSide);
    await session.initialize();
    try {
      const answer = await session.callTool('GetAdtTypes', {});
      const text = answer.content.map((part) => part.text).join('');
      assert.equal(answer.isError, true);
      assert.equal(
        text.includes('RFC_COMMUNICATION_FAILURE'),
        true,
        'the answer names the RFC key',
      );
      assert.equal(
        text.includes(UNREACHABLE_HOST),
        false,
        'the answer names no host',
      );
    } finally {
      await session.close();
      await server.close();
    }
  });
});

/** This process's environment, as strings, without the variables a stand-alone server must not inherit. */
function childEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (name.startsWith('SAP_') || name.startsWith('MCP_')) continue;
    env[name] = value;
  }
  return env;
}

/** Every non-empty stdout line must be a JSON-RPC 2.0 frame. */
const strayLines = (stdout: string): number =>
  stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => {
      try {
        return JSON.parse(line)?.jsonrpc !== '2.0';
      } catch {
        return true;
      }
    }).length;

/** A loopback port free now: bound on port 0 and closed again; nothing listens on it. */
async function closedLoopbackPort(): Promise<number> {
  const probe = createServer();
  const port = await new Promise<number>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address !== null && typeof address === 'object') {
        resolve(address.port);
      } else {
        reject(new Error('the probe has no port'));
      }
    });
  });
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** The failure answer's fields; `{}` for a text that is not one. */
function payloadOf(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? { ...parsed } : {};
  } catch {
    return {};
  }
}

/** The packed release, installed once for this file's cases that start the bin. */
let installed: { workdir: string; bin: string } | undefined;
function installedBin(): string {
  if (installed === undefined) {
    const workdir = mkdtempSync(join(tmpdir(), 'deferred-bin-'));
    installPackedRelease(workdir, [
      '.',
      'background-runs-memory',
      'responsible-rules',
      'server-runtime',
      'http',
      'sse',
      'server',
    ]);
    installed = {
      workdir,
      bin: installedFile(workdir, 'core', 'bin', 'mcp-abap-adt.js'),
    };
  }
  return installed.bin;
}

describe('the installed bin with --deferred-logon', () => {
  after(() => {
    if (installed !== undefined) {
      // Retried: on Windows a just-exited child can hold a file for a moment.
      rmSync(installed.workdir, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 500,
      });
    }
  });

  describe('an unreachable system (a closed loopback port; no SAP system)', () => {
    let dir: string;

    before(() => {
      dir = mkdtempSync(join(tmpdir(), 'deferred-closed-'));
    });

    after(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('--deferred-logon: the server stays up, lists its tools, and each call answers no_connection (ECONNREFUSED)', async () => {
      const bin = installedBin();
      const port = await closedLoopbackPort();
      const envFile = join(dir, 'closed.env');
      writeFileSync(
        envFile,
        [
          `SAP_URL=http://127.0.0.1:${port}`,
          'SAP_CLIENT=001',
          'SAP_AUTH_TYPE=basic',
          'SAP_CONNECTION_TYPE=http',
          'SAP_USERNAME=NOBODY',
          'SAP_PASSWORD=nothing-anywhere',
          '',
        ].join('\n'),
      );
      const server = await launchStdioScript({
        argv: [
          bin,
          `--env-path=${envFile}`,
          `--auth-broker-path=${dir}`,
          '--system-type=onprem',
          '--deferred-logon',
        ],
        env: childEnvironment(),
        cwd: dir,
        // Nothing to log on to: the port is closed.
        logOn: async () => {},
      });
      const child = server.child;
      if (child === undefined) throw new Error('the server did not start');
      let code: number | null;
      const answers: Array<Record<string, unknown>> = [];
      let tools = 0;
      try {
        tools = (await server.listTools()).length;
        for (let call = 0; call < 2; call += 1) {
          const answer = await server.call('GetAdtTypes', {});
          assert.equal(answer.isError, true);
          const text = answer.content.map((part) => part.text).join('');
          assert.equal(text.includes(String(port)), false);
          assert.equal(text.includes('127.0.0.1'), false);
          answers.push(payloadOf(text));
        }
      } finally {
        code =
          process.platform === 'win32' ? await child.end() : await child.stop();
        await server.close();
      }
      assert.equal(tools > 0, true);
      for (const payload of answers) {
        assert.equal(payload.error, 'no_connection');
        assert.equal(String(payload.message).includes('(ECONNREFUSED)'), true);
      }
      assert.equal(code, 0);
      assert.equal(strayLines(child.stdout()), 0);
    });
  });

  /**
   * The real-system cases: run only where `MCP_LIVE_DEFERRED_ENV_PATH` names
   * one HTTP `.env` of a real on-premise system (basic authentication), and,
   * for the take-up case, `MCP_LIVE_DEFERRED_LOCK_CLASS` names a class of the
   * test user's own to lock and unlock. The system is named by nothing in
   * this file; the file's values are never printed.
   */
  const REAL_ENV = (process.env.MCP_LIVE_DEFERRED_ENV_PATH ?? '').trim();
  const LOCK_CLASS = (process.env.MCP_LIVE_DEFERRED_LOCK_CLASS ?? '').trim();
  const realSkip =
    REAL_ENV === ''
      ? 'MCP_LIVE_DEFERRED_ENV_PATH is not set: it names one HTTP .env of a real on-premise system'
      : undefined;

  /** A TCP forwarder on a loopback port of this file's, to `host:port`, opened and closed at will. */
  class Forwarder {
    private server: Server | undefined;
    private readonly sockets = new Set<Socket>();
    constructor(
      readonly port: number,
      private readonly host: string,
      private readonly targetPort: number,
    ) {}

    async open(): Promise<void> {
      const server = createServer((socket) => {
        const upstream = connect(this.targetPort, this.host);
        for (const one of [socket, upstream]) {
          this.sockets.add(one);
          one.on('close', () => this.sockets.delete(one));
          one.on('error', () => {
            socket.destroy();
            upstream.destroy();
          });
        }
        socket.pipe(upstream).pipe(socket);
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.port, '127.0.0.1', () => resolve());
      });
      this.server = server;
    }

    async close(): Promise<void> {
      const server = this.server;
      this.server = undefined;
      for (const socket of this.sockets) socket.destroy();
      if (server !== undefined) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    }
  }

  /**
   * The real `.env` copied into `dir`, its `SAP_URL` pointed at `url`, and the
   * connection type stated `http`: the variable names an HTTP `.env`, and the
   * start refuses a destination that states none.
   */
  function realEnvTo(dir: string, url: string): string {
    const stated = dotenv.parse(readFileSync(REAL_ENV, 'utf8'));
    const lines = Object.entries({
      ...stated,
      SAP_URL: url,
      SAP_CONNECTION_TYPE: 'http',
    }).map(([key, value]) => `${key}=${value}`);
    const file = join(dir, 'real.env');
    writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
    return file;
  }

  describe('a real on-premise system (named only by its variable)', () => {
    let dir: string;
    if (realSkip !== undefined) {
      // Printed in every run, so a skip never reads as a pass.
      console.log(`[deferred-logon] real-system cases skipped: ${realSkip}`);
    }

    before(() => {
      dir = mkdtempSync(join(tmpdir(), 'deferred-real-'));
    });

    after(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('the system becomes reachable mid-session: no_connection first, then the next call answers from the system', {
      skip: realSkip ?? false,
    }, async () => {
      const stated = dotenv.parse(readFileSync(REAL_ENV, 'utf8'));
      const target = new URL(stated.SAP_URL ?? '');
      assert.equal(
        target.protocol,
        'http:',
        'HTTP only: a forwarder breaks a TLS host name check',
      );
      const forwarder = new Forwarder(
        await closedLoopbackPort(),
        target.hostname,
        Number(target.port || '80'),
      );
      const envFile = realEnvTo(dir, `http://127.0.0.1:${forwarder.port}`);
      const server = await launchStdioScript({
        argv: [
          installedBin(),
          `--env-path=${envFile}`,
          `--auth-broker-path=${dir}`,
          '--deferred-logon',
        ],
        env: childEnvironment(),
        cwd: dir,
        logOn: async () => {},
      });
      const child = server.child;
      if (child === undefined) throw new Error('the server did not start');
      let code: number | null;
      try {
        const refused = await server.call('GetAdtTypes', {});
        assert.equal(
          payloadOf(refused.content.map((p) => p.text).join('')).error,
          'no_connection',
        );
        await forwarder.open();
        const answered = await server.call('GetAdtTypes', {});
        assert.equal(answered.isError, false);
      } finally {
        code =
          process.platform === 'win32' ? await child.end() : await child.stop();
        await server.close();
        await forwarder.close();
      }
      assert.equal(code, 0);
    });

    it('the first call takes up a leftover session: a killed process locked, the next process unlocks with its handle', {
      skip:
        realSkip ??
        (LOCK_CLASS === ''
          ? 'MCP_LIVE_DEFERRED_LOCK_CLASS is not set: it names a class of the test user to lock'
          : false),
    }, async () => {
      const envFile = realEnvTo(
        dir,
        dotenv.parse(readFileSync(REAL_ENV, 'utf8')).SAP_URL ?? '',
      );
      const args: [string, ...string[]] = [
        installedBin(),
        `--env-path=${envFile}`,
        `--auth-broker-path=${dir}`,
        '--deferred-logon',
      ];
      // The flow and its cleanup are takeUpCase's (pinned by
      // unit/coverage/takeUpCase.test.ts): once the first process may have
      // written its session, every path that did not unlock logs off the
      // destination's leftover sessions.
      const launch = async (
        argv: readonly [string, ...string[]],
      ): Promise<TakeUpServer> => {
        const server = await launchStdioScript({
          argv,
          env: childEnvironment(),
          cwd: dir,
          logOn: async () => {},
        });
        return {
          call: (tool, toolArgs) => server.call(tool, toolArgs),
          close: () => server.close(),
          kill: () => {
            server.child?.process.kill('SIGKILL');
          },
          stop: async () =>
            server.child === undefined ? null : server.child.stop(),
        };
      };
      const result = await takeUpCase(
        {
          first: () => launch(args),
          second: () =>
            launch([args[0], ...args.slice(1), '--restore-session']),
          cleaner: () => launch(args),
        },
        LOCK_CLASS,
      );
      assert.equal(result.unlocked, true);
      assert.equal(result.secondExit, 0);
    });
  });
});
