/**
 * stdio without its SAP system at the start (fr0ster/mcp-abap-adt#353).
 *
 * **Where it runs.** Only under its live script,
 * `npm run test:live-deferred-logon` (one file at a time; never in
 * `npm test`). Run with no test config (no `tests/test-config.yaml`,
 * `MCP_TEST_CONFIG` unset), the live run's setup checks no realm and logs on
 * nowhere: nothing here needs a system but the real-system cases, which run
 * only where their variable names one and skip with the reason elsewhere.
 *
 * **The RFC case** reaches no system: its host is the reserved name
 * `unreachable.invalid`, which never resolves, and its credentials exist
 * nowhere. It needs `@mcp-abap-adt/sap-rfc-lite` and the SAP NW RFC library,
 * and skips, saying so, where they do not load. It asserts what a tool call
 * answers when the RFC logon cannot reach its system: the RFC key, and no
 * host.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { IAuthorizationStrategy } from '@mcp-abap-adt/interfaces-auth';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { AuthBrokerFactory } from '../../../../server-runtime/src/stdio/auth/brokerFactory';
import { readCoreConfig } from '../../../../server-runtime/src/stdio/config/coreParameters';
import { factoryConfigFrom } from '../../../../server-runtime/src/stdio/launcher';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { fullToolSet, registryOf } from '../../../lib/toolSet';

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

/** The one text of a tool answer. */
function textOf(result: unknown): string {
  const content =
    typeof result === 'object' && result !== null && 'content' in result
      ? result.content
      : undefined;
  if (!Array.isArray(content)) return '';
  return content
    .map((part: unknown) =>
      typeof part === 'object' &&
      part !== null &&
      'text' in part &&
      typeof part.text === 'string'
        ? part.text
        : '',
    )
    .join('');
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
    const server = new StdioServer(registryOf(fullToolSet, 'stdio'), factory, {
      version: '0.0.0-test',
    });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    // The first tool call makes the connection (no connectAtStart).
    await server.start(destination, serverSide);
    const client = new Client({ name: 'deferred-rfc', version: '0.0.0' });
    await client.connect(clientSide);
    try {
      const answer = await client.callTool({
        name: 'GetAdtTypes',
        arguments: {},
      });
      const text = textOf(answer);
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
      await client.close();
      await server.close();
    }
  });
});
