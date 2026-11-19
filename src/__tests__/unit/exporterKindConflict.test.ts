/**
 * A connection the factory built for one kind, handed to a handler the
 * exporter states another kind for, is refused as contradictory (D26 E11):
 * the recorded kind won silently before. The same kind, or an exporter
 * stating none, runs as before. Nothing is sent: the handler never runs.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import { BasicAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import * as z from 'zod';
import { createAbapConnection } from '../../lib/connectionFactory';
import { ReadOnlyHandlersGroup } from '../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../lib/handlers/interfaces';
import {
  assertMatchObject,
  assertRejects,
  rejectionOf,
} from '../helpers/assertions';

const SETTINGS: SapConfig = {
  url: 'https://sap.example.invalid',
  client: '100',
  authType: 'basic',
};

let ran = 0;
const probe = {
  toolDefinition: {
    name: 'KindProbe',
    description: 'counts its runs',
    inputSchema: z.object({}),
  },
  call: (async () => {
    ran += 1;
    return { content: [{ type: 'text', text: 'ok' }] };
  }) as never,
} as never as HandlerEntry;

beforeEach(() => {
  ran = 0;
  // One list, made when the spy is told it, as Jest's mockReturnValue.
  const handlers = [probe];
  mock.method(ReadOnlyHandlersGroup.prototype, 'getHandlers', () => handlers);
});
afterEach(() => mock.restoreAll());

function call(exporterKind: 'onprem' | 'cloud' | undefined) {
  const connection = createAbapConnection(
    SETTINGS,
    new BasicAuthProvider('user', 'secret'),
    null,
    undefined,
    undefined,
    'onprem',
  );
  const entry = new HandlerExporter(
    exporterKind === undefined ? {} : { systemType: exporterKind },
  )
    .getHandlerEntries()
    .find((e) => e.toolDefinition.name === 'KindProbe');
  if (entry === undefined) throw new Error('no probe');
  return entry.call(
    { connection, logger: undefined } as never as HandlerContext,
    {} as never,
  );
}

it('built for onprem, the exporter states cloud: refused naming both, the handler not run', async () => {
  assertMatchObject(await rejectionOf(call('cloud')), {
    serverRefusal: 'system_type_conflict',
  });
  await assertRejects(
    call('cloud'),
    'the connection was built for onprem and the server, registration or exporter states cloud',
  );
  assert.equal(ran, 0);
});

it('the same kind, or none stated, runs', async () => {
  await call('onprem');
  await call(undefined);
  assert.equal(ran, 2);
});
