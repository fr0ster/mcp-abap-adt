/**
 * The read envelopes on the served surface (spec §5.1, §5.2), table-driven
 * from the core entries of `tools/batch-handlers.json`, so it grows with the
 * table: every admitted core read declares `envelope_handle` with its words
 * and ends with its envelope note; no other core tool declares it or says
 * it; every other core tool's listed schema is its own but for
 * `additionalProperties`; the compact sets' tools are as before.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { InMemoryBackgroundRuns } from '@mcp-abap-adt/background-runs-memory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMcpServer } from '../../../embeddable/BaseMcpServer';
import { isEnvelopeTool } from '../../../lib/batch/batchTools';
import { batchEntries } from '../../../lib/batch/eligibility';
import { ENVELOPE_HANDLE_WORDS } from '../../../lib/batch/envelopeTools';
import { InstanceEnvelopes } from '../../../lib/batch/InstanceEnvelopes';
import { envelopeSentence } from '../../../lib/batch/sentence';
import * as connectionFactory from '../../../lib/connectionFactory';
import type { IHandlersRegistry } from '../../../lib/handlers/interfaces';
import { fullToolSet, registryOf } from '../../../lib/toolSet';

mock.method(connectionFactory, 'createAbapConnection', () => {
  throw new Error('no connection may be built here');
});

const silent = { info() {}, debug() {}, warn() {}, error() {} };

class SurfaceServer extends BaseMcpServer {
  constructor(registry: IHandlersRegistry, envelopes: boolean) {
    super({
      name: 'envelope-surface',
      version: '1.0.0',
      logger: silent as never,
      systemType: 'onprem',
      backgroundRuns: new InMemoryBackgroundRuns(),
      ...(envelopes
        ? { envelopes: new InstanceEnvelopes({ keepRawParts: false }) }
        : {}),
    });
    this.registerHandlers(registry);
  }
}

type Listed = {
  name: string;
  description?: string;
  inputSchema: { properties?: Record<string, { description?: string }> };
};

async function listed(registry: IHandlersRegistry): Promise<Listed[]> {
  const server = new SurfaceServer(registry, true);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'surface', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools as Listed[];
}

const coreRegistry = () =>
  registryOf(fullToolSet, 'stdio', {
    dataTools: true,
  });

describe('the read envelopes on the surface', () => {
  it('every admitted core read declares envelope_handle with its words and ends with its note; no other core tool does', async () => {
    const tools = await listed(coreRegistry());
    const admitted = new Set(
      batchEntries()
        .filter((entry) => entry.set === 'core')
        .map((entry) => entry.tool),
    );
    assert.ok(admitted.size > 0);
    const faults: string[] = [];
    for (const tool of tools) {
      const declares = tool.inputSchema.properties?.envelope_handle;
      const sentence = envelopeSentence(tool.name);
      if (admitted.has(tool.name)) {
        if (declares?.description !== ENVELOPE_HANDLE_WORDS) {
          faults.push(
            `${tool.name}: envelope_handle undeclared or other words`,
          );
        }
        if (sentence === undefined || !tool.description?.endsWith(sentence)) {
          faults.push(`${tool.name}: no envelope note`);
        }
      } else if (!isEnvelopeTool(tool.name)) {
        if (declares !== undefined) {
          faults.push(`${tool.name}: declares envelope_handle`);
        }
        if (tool.description?.includes('envelope_handle')) {
          faults.push(`${tool.name}: says envelope_handle`);
        }
      }
    }
    for (const name of admitted) {
      if (!tools.some((tool) => tool.name === name)) {
        faults.push(`${name}: admitted but not served`);
      }
    }
    assert.deepStrictEqual(faults, []);
  });
});
