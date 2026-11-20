/**
 * `@mcp-abap-adt/lib/utils`' builders take the kind (D26 B3):
 * `setConfigOverride(config, kind)` builds that kind and keeps it with the
 * configuration; `getManagedConnection(kind?)` states one; the environment
 * answers only below an explicit kind. The reuse decision includes the kind:
 * an override built for one kind is not handed out for another, and a
 * rebuild after `invalidateConnectionCache` keeps the configured kind,
 * whatever `SAP_SYSTEM_TYPE` says in between. Nothing is sent: building
 * a connection connects nothing.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it } from 'node:test';
import type { SapConfig } from '@mcp-abap-adt/connection';
import { resetProcessLatchForTests } from '../../lib/activeTools';
import { systemKindOf } from '../../lib/connectionFactory';
import {
  getManagedConnection,
  invalidateConnectionCache,
  setConfigOverride,
} from '../../lib/utils';
import { assertThrows } from '../helpers/assertions';

const SETTINGS: SapConfig = {
  url: 'https://sap.example.invalid',
  client: '100',
  authType: 'basic',
  username: 'placeholder-user',
  password: 'placeholder-password',
};

const previous = process.env.SAP_SYSTEM_TYPE;
beforeEach(() => resetProcessLatchForTests());
afterEach(() => {
  setConfigOverride(undefined);
  if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = previous;
});

it('setConfigOverride with a stated kind builds that kind, SAP_SYSTEM_TYPE unset', () => {
  delete process.env.SAP_SYSTEM_TYPE;
  setConfigOverride(SETTINGS, 'onprem');
  assert.equal(systemKindOf(getManagedConnection()), 'onprem');
});

it('the stated kind beats SAP_SYSTEM_TYPE', () => {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  setConfigOverride(SETTINGS, 'cloud');
  assert.equal(systemKindOf(getManagedConnection()), 'cloud');
});

it('getManagedConnection states its kind; the same kind is the same connection', () => {
  delete process.env.SAP_SYSTEM_TYPE;
  setConfigOverride(SETTINGS, 'onprem');
  const first = getManagedConnection('onprem');
  assert.equal(getManagedConnection('onprem'), first);
});

it('a request for another kind than the override was configured for is refused', () => {
  setConfigOverride(SETTINGS, 'onprem');
  assertThrows(
    () => getManagedConnection('cloud'),
    'The configured connection is built for onprem; cloud was asked for',
  );
});

it('after invalidation the rebuilt connection keeps the configured kind', () => {
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  setConfigOverride(SETTINGS, 'cloud');
  const before = getManagedConnection();
  invalidateConnectionCache();
  process.env.SAP_SYSTEM_TYPE = 'onprem';
  const after = getManagedConnection();
  assert.notEqual(after, before);
  assert.equal(systemKindOf(after), 'cloud');
});

it('without a kind, SAP_SYSTEM_TYPE answers', () => {
  process.env.SAP_SYSTEM_TYPE = 'cloud';
  setConfigOverride(SETTINGS);
  assert.equal(systemKindOf(getManagedConnection()), 'cloud');
});
