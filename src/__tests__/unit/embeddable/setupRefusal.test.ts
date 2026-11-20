/**
 * Setting a source's context up builds no connection: there is no
 * setup-time master-system lookup (the master system and responsible are
 * resolved per call, on the connected connection). A request whose credential
 * refuses presents it once, when the request connects, answers the refusal in
 * its fixed words, and leaves no partial system context cached for the
 * process — so the next request tries again, once.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError, type SapConfig } from '@mcp-abap-adt/connection';
import type { IAuthProvider } from '@mcp-abap-adt/interfaces-auth';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import type { ConnectionSource } from '../../../embeddable/ConnectionContext';
import { failureOf } from '../../../lib/auth/failures';
import * as connectionFactory from '../../../lib/connectionFactory';
import {
  getSystemContext,
  resetSystemContextCache,
} from '../../../lib/systemContext';

const silent = { info() {}, debug() {}, warn() {}, error() {} };

class TestServer extends BaseMcpServer {
  constructor() {
    super({ name: 'test-server', version: '1.0.0', logger: silent });
  }
  fromSource(source: ConnectionSource) {
    this.setConnectionContext({ kind: 'built', source });
  }
  connection() {
    return this.getConnection(new AbortController().signal);
  }
}

const REFUSAL = authError['credential-refused']({ credential: 'token' });
const REASON = REFUSAL.reason;

function refusingProvider() {
  const prepare = mock.fn(async () => ({
    ok: false as const,
    refusal: REFUSAL,
  }));
  const ok = async () => ({ ok: true as const });
  const provider: IAuthProvider = {
    kind: 'refusing',
    prepare,
    establish: ok,
    authorize: ok,
    rejected: ok,
  };
  return { provider, prepare };
}

const SETTINGS: SapConfig = {
  url: 'https://system.example.invalid',
  authType: 'jwt',
};

function sourceOf(provider: IAuthProvider): ConnectionSource {
  return {
    resolve: async () => ({ settings: { ...SETTINGS }, credential: provider }),
  };
}

/** One request as a transport runs it: set the context up, then connect. */
async function request(source: ConnectionSource): Promise<unknown> {
  const server = new TestServer();
  try {
    server.fromSource(source);
    await server.connection();
  } catch (error) {
    return error;
  }
  throw new Error('expected the request to fail');
}

const savedEnv = process.env;

beforeEach(() => {
  process.env = { ...savedEnv };
  for (const name of [
    'SAP_MASTER_SYSTEM',
    'SAP_RESPONSIBLE',
    'SAP_USERNAME',
    'SAP_LANGUAGE',
    'SAP_SYSTEM_TYPE',
  ]) {
    delete process.env[name];
  }
  // The system kind is required: stated for every case.
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  resetSystemContextCache();
});

afterEach(() => {
  process.env = savedEnv;
  resetSystemContextCache();
});

describe('setting the context up', () => {
  it('builds no connection and presents nothing', async (t) => {
    const build = t.mock.method(connectionFactory, 'createAbapConnection');
    try {
      const { provider, prepare } = refusingProvider();
      const server = new TestServer();
      server.fromSource(sourceOf(provider));
      assert.equal(build.mock.callCount(), 0);
      assert.equal(prepare.mock.callCount(), 0);
    } finally {
      build.mock.restore();
    }
  });
});

describe('a refused credential', () => {
  it('one prepare per request, the refusal answered, no context cached', async () => {
    const { provider, prepare } = refusingProvider();
    const source = sourceOf(provider);

    const first = await request(source);
    assert.ok(first instanceof AuthRefusedError);
    assert.equal(prepare.mock.callCount(), 1);
    assert.deepStrictEqual(getSystemContext(), {});

    const second = await request(source);
    assert.ok(second instanceof AuthRefusedError);
    assert.equal(prepare.mock.callCount(), 2);
    assert.deepStrictEqual(getSystemContext(), {});
  });

  it('is answered in its own fixed words', async () => {
    const { provider } = refusingProvider();
    const error = await request(sourceOf(provider));
    // The refusal's own words, as auth-errors rendered them: reason, then hint.
    const read = failureOf(error);
    assert.equal(read?.error, 'authentication_failed');
    assert.equal(read?.message, REASON);
    assert.equal(read?.hint, REFUSAL.hint);
  });
});
