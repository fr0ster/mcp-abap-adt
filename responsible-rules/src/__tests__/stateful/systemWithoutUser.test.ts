/**
 * An ABAP Cloud system whose `systeminformation` answers but names no user —
 * the field missing, empty, blank, not a string, a body that is no JSON or
 * JSON that is no object — gave no information: on ABAP Cloud, which always
 * has it, one step to the error. On a built instance (http, sse) the call
 * answers `system_lookup_failed` and its tool does not run; nothing of the
 * answer is kept, so the next call asks again and, once the system names its
 * user, its tool runs once. (On-premise the same answer goes to the stated
 * values: `systemContextRequired.test.ts`; a stdio start ends with its own
 * words: `server-runtime/src/stdio/__tests__/startConnector.test.ts`.)
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import { format } from 'node:util';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import {
  type AdtStandIn,
  adtStandIn,
  type StandInRequest,
} from '../../../../src/__tests__/helpers/adtStandIn';
import { assertMatchObject } from '../../../../src/__tests__/helpers/assertions';
import {
  clientOf,
  silent,
} from '../../../../src/__tests__/unit/backgroundRuns/harness';
import { oneToolGroup } from '../../../../src/__tests__/unit/stateful/harness';
import { CompositeHandlersRegistry } from '../../../../src/lib/handlers/registry/CompositeHandlersRegistry';
import { StandServer } from '../helpers/withRules';

const isLookup = (r: StandInRequest) => r.url.includes('systeminformation');
const of = (name: string) => (r: StandInRequest) =>
  r.url.toLowerCase().includes(name.toLowerCase());

let previousType: string | undefined;
beforeEach(() => {
  previousType = process.env.SAP_SYSTEM_TYPE;
  process.env.SAP_SYSTEM_TYPE = 'cloud';
});
afterEach(() => {
  if (previousType === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previousType;
});

async function cloudStand(standIn: AdtStandIn) {
  const server = new StandServer({
    name: 'system-without-user',
    logger: silent,
    systemType: 'cloud',
  });
  server.use({
    settings: {
      url: standIn.url,
      client: '100',
      authType: 'basic',
      username: 'LOOKUP_USER',
    },
    credential: new BasicAuthProvider('LOOKUP_USER', 'lookup-password'),
  });
  server.register(new CompositeHandlersRegistry([oneToolGroup('GetClass')]));
  const client = await clientOf(server);
  return {
    call: client.call,
    close: async () => {
      await client.close();
      await server.terminalClose();
    },
  };
}

const WITHOUT_USER: Array<[string, string]> = [
  ['no userName', JSON.stringify({ systemID: 'CLD' })],
  ['an empty userName', JSON.stringify({ userName: '', systemID: 'CLD' })],
  ['a blank userName', JSON.stringify({ userName: '  ', systemID: 'CLD' })],
  ['a userName that is no string', JSON.stringify({ userName: 42 })],
  ['a body that is no JSON', 'not json'],
  ['an empty body', ''],
  ['a JSON array', JSON.stringify([{ userName: 'ARRAY_USER' }])],
  ['a JSON number', '42'],
  ['JSON null', 'null'],
];

for (const [_what, body] of WITHOUT_USER) {
  it(
    format(
      'cloud, systeminformation with %s: the call answers system_lookup_failed, its tool not run; the next call asks again',
      _what,
    ),
    async () => {
      const standIn = await adtStandIn();
      // The first lookup is answered `body`; once the system is fixed, it names
      // its user.
      let fixed = false;
      standIn.body((r) => isLookup(r) && !fixed, body);
      standIn.body(
        isLookup,
        JSON.stringify({ userName: 'CLOUD_USER', systemID: 'CLD' }),
      );
      const s = await cloudStand(standIn);
      try {
        const first = await s.call('GetClass', { class_name: 'ZCL_FIRST' });
        assert.equal(first.isError, true);
        assertMatchObject(first.payload, { error: 'system_lookup_failed' });
        assert.equal(standIn.requests.some(of('ZCL_FIRST')), false);

        // Nothing kept: still refused while the system names no user.
        const again = await s.call('GetClass', { class_name: 'ZCL_AGAIN' });
        assertMatchObject(again.payload, { error: 'system_lookup_failed' });
        assert.equal(standIn.requests.filter(isLookup).length, 2);

        fixed = true;
        const second = await s.call('GetClass', { class_name: 'ZCL_SECOND' });
        assert.equal(second.isError, false);
        assert.equal(standIn.requests.filter(isLookup).length, 3);
        assert.ok(standIn.requests.filter(of('ZCL_SECOND')).length > 0);
        assert.equal(standIn.requests.some(of('ZCL_FIRST')), false);
      } finally {
        await s.close();
        await standIn.close();
      }
    },
  );
}
