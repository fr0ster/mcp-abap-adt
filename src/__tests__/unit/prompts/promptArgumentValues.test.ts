/**
 * A client without `completion/complete` reads a closed prompt argument's
 * values in its description: on every binary and declared system type, and
 * with `--deny-actions` applied as a launcher applies it, each closed
 * argument's description ends with exactly the values its completion
 * offers, in their order. A prompt's own description states its function
 * and names none of the tools its steps call.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { InMemoryBackgroundRuns } from '../../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { compactToolSet } from '../../../../compact/src/launcher';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import {
  fullToolSet,
  restrictedStart,
  type ToolSet,
} from '../../../lib/toolSet';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import { toolsNamed } from '../../helpers/promptArguments';
import { listedPromptTools } from '../../helpers/promptTools';
import {
  type DeclaredType,
  type ListedPrompt,
  listBinaryPrompts,
  type PromptListing,
  promptsOf,
} from '../../helpers/servedTools';

/** The closed arguments of each prompt: those that complete from a closed set. */
const CLOSED: Readonly<Record<string, readonly string[]>> = {
  create: ['object_type'],
  get: ['object_type'],
  update: ['object_type'],
  delete: ['object_type'],
  activate: ['object_type'],
  check: ['object_type'],
  unit_test: ['object_type', 'include_subpackages'],
  where_used: ['object_type', 'container'],
  transport: ['action', 'object_type'],
};

/** The values a description lists: what follows its last `: `, up to the closing period, split at `, `. */
function listedValues(description: string): readonly string[] {
  const start = description.lastIndexOf(': ');
  assert.ok(start >= 0, `${JSON.stringify(description)} lists values`);
  assert.ok(description.endsWith('.'), description);
  return description.slice(start + 2, -1).split(', ');
}

/**
 * Every closed argument `listed` declares completes, and its description
 * lists exactly its completion's values; no other argument completes.
 * Answers the number of arguments checked.
 */
function assertListed(where: string, listed: ListedPrompt): number {
  const { prompt, completions } = listed;
  const closed = CLOSED[prompt.name];
  assert.ok(closed, `${where} ${prompt.name} is a known prompt`);
  let checked = 0;
  for (const argument of prompt.arguments ?? []) {
    const values = completions[argument.name];
    const label = `${where} ${prompt.name} ${argument.name}`;
    if (!closed.includes(argument.name)) {
      assert.equal(values, undefined, `${label} completes nothing`);
      continue;
    }
    assert.ok(values && values.length > 0, `${label} completes`);
    assert.ok(argument.description, `${label} is described`);
    assert.deepEqual(listedValues(argument.description), values, label);
    checked += 1;
  }
  return checked;
}

/** A client of `set`'s stdio server on `onprem`, `denied` applied as a launcher applies it. */
async function deniedClient(
  set: ToolSet,
  denied: readonly string[],
): Promise<Client> {
  const { registry } = restrictedStart(
    set,
    'stdio',
    { dataTools: false },
    {
      deniedActions: denied.map((entry) => parseDeniedEntry(entry, 'test')),
      lists: {},
    },
  );
  const server = new StdioServer(registry, undefined, {
    backgroundRuns: new InMemoryBackgroundRuns(),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.start(undefined, serverSide);
  const client = new Client({ name: 'prompt-argument-values', version: '1' });
  await client.connect(clientSide);
  return client;
}

const LISTED_TYPES: readonly DeclaredType[] = ['onprem', 'cloud', 'none'];

describe('a closed prompt argument lists its completion values in its description', () => {
  let standIn: AdtStandIn;
  let listings: PromptListing[] = [];
  const opened: Client[] = [];
  const saved = process.env.SAP_SYSTEM_TYPE;

  before(async () => {
    mock.method(console, 'error', () => {});
    resetProcessLatchForTests();
    standIn = await adtStandIn();
    listings = await listBinaryPrompts(LISTED_TYPES, standIn);
  });

  after(async () => {
    for (const client of opened) await client.close();
    await standIn?.close();
    if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = saved;
    resetProcessLatchForTests();
    mock.restoreAll();
  });

  it('on every binary and declared system type', () => {
    let checked = 0;
    for (const { systemType, bin, prompts } of listings) {
      assert.ok(prompts.length > 0, `${systemType} ${bin} lists prompts`);
      for (const listed of prompts) {
        checked += assertListed(`${systemType} ${bin}`, listed);
      }
    }
    assert.ok(checked > 250, `${checked} arguments checked`);
  });

  it('on every binary, the transport object_type names the actions that read it', () => {
    for (const { systemType, bin, prompts } of listings) {
      const transport = prompts.find(
        ({ prompt }) => prompt.name === 'transport',
      );
      const objectType = transport?.prompt.arguments?.find(
        ({ name }) => name === 'object_type',
      );
      if (objectType === undefined) continue;
      assert.ok(
        objectType.description?.startsWith("The object's type (read by "),
        `${systemType} ${bin}: ${objectType.description}`,
      );
    }
  });

  for (const [set, family, denied, prompt, argument, gone] of [
    [fullToolSet, 'core', 'CreateClass', 'create', 'object_type', 'class'],
    [
      compactToolSet,
      'compact',
      'HandlerCreate.CLASS',
      'create',
      'object_type',
      'class',
    ],
    [fullToolSet, 'core', 'CreateTransport', 'transport', 'action', 'create'],
  ] as const) {
    it(`with --deny-actions ${denied} on ${family}: ${prompt} ${argument} lists no ${gone}`, async () => {
      process.env.SAP_SYSTEM_TYPE = 'onprem';
      const client = await deniedClient(set, [denied]);
      opened.push(client);
      const listed = (await promptsOf(client)).find(
        (each) => each.prompt.name === prompt,
      );
      assert.ok(listed, `${family} lists ${prompt}`);
      assertListed(`${family} denied ${denied}`, listed);
      const values = listed.completions[argument] ?? [];
      assert.ok(values.length > 0, `${prompt} ${argument} completes`);
      assert.ok(!values.includes(gone), `${gone} is denied`);
    });
  }

  it('a prompt description names none of the tools its steps call', () => {
    const toolsOf = listedPromptTools(listings);
    for (const listing of listings) {
      for (const { prompt } of listing.prompts) {
        const called = new Set(toolsOf(listing, prompt.name));
        assert.ok(called.size > 0, `${listing.bin} ${prompt.name} calls tools`);
        assert.deepEqual(
          toolsNamed(prompt.description ?? '', called),
          [],
          `${listing.systemType} ${listing.bin} ${prompt.name}: ${prompt.description}`,
        );
      }
    }
  });
});
