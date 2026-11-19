/**
 * The exporter's `logger` is used on `getHandlerEntries()` (D26 E9): a
 * handed-out handler runs with the exporter's logger in its context, not the
 * embedder's; without one, the embedder's context logger stays.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import * as z from 'zod';
import { ReadOnlyHandlersGroup } from '../../lib/handlers/groups/ReadOnlyHandlersGroup';
import { HandlerExporter } from '../../lib/handlers/HandlerExporter';
import type {
  HandlerContext,
  HandlerEntry,
} from '../../lib/handlers/interfaces';

const silent = () => ({ info() {}, debug() {}, warn() {}, error() {} });

let seen: HandlerContext['logger'] | undefined;
const probe = {
  toolDefinition: {
    name: 'LoggerProbe',
    description: 'records its context logger',
    inputSchema: z.object({}),
  },
  call: (async (context: HandlerContext) => {
    seen = context.logger;
    return { content: [{ type: 'text', text: 'ok' }] };
  }) as never,
} as never as HandlerEntry;

beforeEach(() => {
  seen = undefined;
  // One list, made when the spy is told it.
  const handlers = [probe];
  mock.method(ReadOnlyHandlersGroup.prototype, 'getHandlers', () => handlers);
});
afterEach(() => mock.restoreAll());

async function callProbe(exporter: HandlerExporter, logger: object) {
  const entry = exporter
    .getHandlerEntries()
    .find((e) => e.toolDefinition.name === 'LoggerProbe');
  if (entry === undefined) throw new Error('no probe entry');
  await entry.call(
    { connection: {} as never, logger } as HandlerContext,
    {} as never,
  );
}

it("an exporter's logger reaches the handler, over the embedder's", async () => {
  const own = silent();
  await callProbe(new HandlerExporter({ logger: own }), silent());
  assert.equal(seen, own);
});

it("without one, the embedder's context logger stays", async () => {
  const embedder = silent();
  await callProbe(new HandlerExporter(), embedder);
  assert.equal(seen, embedder);
});
