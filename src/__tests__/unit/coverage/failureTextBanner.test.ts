/**
 * A live suite's failure text carries the server's own lines, never its
 * configuration banner: the box `formatAuthConfigForDisplay` writes on
 * stderr at the start names the start of the SAP URL (or the RFC address),
 * the UAA URL and the env file the session came from. The suites read the
 * server's stderr through `stderrTail` and the launcher's exit error
 * (`childOf`); both leave the banner out and keep every other line — the
 * failing step's words included.
 *
 * The banner here is the server's own (`formatAuthConfigForDisplay`), with
 * invented values, so a change of its shape reaches this test.
 */

import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { formatAuthConfigForDisplay } from '../../../lib/utils';
import {
  stderrTail,
  withoutConfigBanner,
} from '../../integration/helpers/failureText';
import { childOf } from '../../integration/helpers/testers/hardMode';

const SAP_HOST = 'sap-host.invalid';
const UAA_HOST = 'uaa-host.invalid';
const RFC_HOST = 'rfc-host.invalid';
const ENV_FILE = '/home/someone/.config/mcp-abap-adt/sessions/dest.env';

const httpBanner = formatAuthConfigForDisplay(
  {
    serviceUrl: `https://${SAP_HOST}:44300`,
    sapClient: '100',
    authType: 'jwt',
    jwtToken: 'token',
    refreshToken: 'refresh',
    uaaUrl: `https://${UAA_HOST}`,
    uaaClientId: 'client',
    uaaClientSecret: 'secret',
  },
  ENV_FILE,
);
const rfcBanner = formatAuthConfigForDisplay(
  {
    rfcAddress: [['RFC host', RFC_HOST]],
    sapClient: '100',
    authType: 'basic',
    username: 'USER',
    password: 'pw',
  },
  ENV_FILE,
);

const STEP = '[MCP] Shutdown did not settle: SessionLogoffError (400, SDA/012)';

const server = (banner: string): string =>
  `[MCP] Destination "dest": starting\n${banner}\n${STEP}\n`;

function assertNoBanner(text: string): void {
  for (const secret of [SAP_HOST, UAA_HOST, RFC_HOST, ENV_FILE, 'SAP URL']) {
    assert.equal(text.includes(secret), false, `${secret} reached: ${text}`);
  }
}

describe('the failure text of a live suite', () => {
  it('the banner, over HTTP and over RFC, names a host and the env file', () => {
    for (const banner of [httpBanner, rfcBanner]) {
      assert.equal(banner.includes(ENV_FILE), true);
    }
    assert.equal(httpBanner.includes(SAP_HOST), true);
    assert.equal(httpBanner.includes(UAA_HOST), true);
    assert.equal(rfcBanner.includes(RFC_HOST), true);
  });

  it('withoutConfigBanner drops the banner and keeps every other line as it is', () => {
    for (const banner of [httpBanner, rfcBanner]) {
      const kept = withoutConfigBanner(server(banner));
      assertNoBanner(kept);
      assert.equal(kept, `[MCP] Destination "dest": starting\n${STEP}\n`);
    }
  });

  it('a tail cut inside the banner keeps none of it', () => {
    const cut = httpBanner.split('\n').slice(3).join('\n');
    assert.equal(cut.includes(UAA_HOST), true);
    assertNoBanner(withoutConfigBanner(`${cut}\n${STEP}`));
  });

  it('stderrTail: the server’s lines and the failing step’s words, no banner; session traces aside', () => {
    const process = standIn();
    const child = childOf(process);
    process.stderr?.emit('data', '[MCP] Destination "dest": starting\n');
    const tail = stderrTail(child);
    process.stderr?.emit('data', `${httpBanner}\nsession-trace\treq\t1\n`);
    process.stderr?.emit('data', `${STEP}\n`);
    const text = tail.text();
    assertNoBanner(text);
    assert.equal(text.includes(STEP), true);
    assert.equal(text.includes('[MCP] Destination "dest": starting'), true);
    assert.deepEqual(tail.trace(), ['session-trace\treq\t1']);
  });

  it('the launcher’s exit error: the exit status and the step’s words, no banner', async () => {
    const process = standIn();
    const child = childOf(process);
    const rejected = assert.rejects(child.exited, (error: unknown) => {
      assert.ok(error instanceof Error);
      assertNoBanner(error.message);
      assert.equal(error.message.includes('the child exited (1)'), true);
      assert.equal(error.message.includes(STEP), true);
      return true;
    });
    process.stderr?.emit('data', server(rfcBanner));
    process.emit('close', 1, null);
    await rejected;
  });
});

/** A stand-in process — no real one — whose stderr and close the test fires. */
function standIn(): ChildProcess {
  const process = new ChildProcess();
  process.stdin = new PassThrough();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  return process;
}
