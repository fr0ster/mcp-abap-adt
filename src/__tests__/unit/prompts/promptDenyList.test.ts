/**
 * Test 4: the deny list reaches the prompts through the tools the server
 * lists. Each entry is applied as a launcher applies it (`restrictedStart`,
 * whose registry is `withoutDenied`'s), the server started as a launcher
 * starts it on `onprem`, and the listing, the completion and the refusal
 * read over a client. The prompt module reads no deny entry: nothing under
 * `src/lib/prompts/` imports from `src/lib/access/`.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, describe, it, mock } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryBackgroundRuns } from '../../../../background-runs-memory/src/InMemoryBackgroundRuns';
import { compactToolSet } from '../../../../compact/src/launcher';
import { StdioServer } from '../../../../server-runtime/src/stdio/StdioServer';
import { parseDeniedEntry } from '../../../lib/access/deniedActions';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { EMPTIED_INCLUDE_TYPES } from '../../../lib/compact/compactSchemas';
import { LOCKED_AS } from '../../../lib/prompts/objectRows';
import { notServedWords } from '../../../lib/prompts/refusals';
import {
  fullToolSet,
  restrictedStart,
  type ToolSet,
} from '../../../lib/toolSet';
import { repositoryRoot } from '../../helpers/repoRoot';

/** A client of `set`'s stdio server on `onprem`, `denied` applied as a launcher applies it. */
async function clientOf(
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
  const client = new Client({ name: 'prompt-deny-list', version: '1' });
  await client.connect(clientSide);
  return client;
}

/** The values `prompt`'s `object_type` completes on `client`'s server. */
async function served(client: Client, prompt: string): Promise<string[]> {
  const { completion } = await client.complete({
    ref: { type: 'ref/prompt', name: prompt },
    argument: { name: 'object_type', value: '' },
  });
  return completion.values;
}

/** `prompts/get` of `prompt` with `args` is refused as InvalidParams with `words`. */
async function assertRefused(
  client: Client,
  prompt: string,
  args: Record<string, string>,
  words: string,
): Promise<void> {
  await assert.rejects(
    client.getPrompt({ name: prompt, arguments: args }),
    (error: Error) => {
      assert.ok(error instanceof McpError);
      assert.equal(error.code, ErrorCode.InvalidParams);
      // The SDK prefixes the code once on the server's error and again on
      // the client's, so the words end the message.
      assert.ok(error.message.endsWith(`: ${words}`), error.message);
      return true;
    },
  );
}

const names = async (client: Client): Promise<string[]> =>
  (await client.listPrompts()).prompts.map(({ name }) => name);

describe('test 4: the deny list, through the listed tools', () => {
  const saved = process.env.SAP_SYSTEM_TYPE;
  const opened: Client[] = [];
  const open = async (set: ToolSet, denied: readonly string[]) => {
    const client = await clientOf(set, denied);
    opened.push(client);
    return client;
  };

  before(() => {
    mock.method(console, 'error', () => {});
    resetProcessLatchForTests();
    process.env.SAP_SYSTEM_TYPE = 'onprem';
  });

  after(async () => {
    for (const client of opened) await client.close();
    if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = saved;
    resetProcessLatchForTests();
    mock.restoreAll();
  });

  for (const [set, family, entry] of [
    [fullToolSet, 'core', 'CreateClass'],
    [compactToolSet, 'compact', 'HandlerCreate.CLASS'],
  ] as const) {
    it(`${entry} takes class out of ${family}'s create`, async () => {
      const allowed = await served(await open(set, []), 'create');
      assert.ok(allowed.includes('class'));
      const denied = await open(set, [entry]);
      const left = await served(denied, 'create');
      assert.deepEqual(
        left,
        allowed.filter((type) => type !== 'class'),
      );
      await assertRefused(
        denied,
        'create',
        { object_type: 'class', name: 'SOME_CLASS' },
        notServedWords('create', 'class', left),
      );
    });
  }

  it("HandlerLock.CLASS takes the class and its includes out of compact's update and the class-include delete", async () => {
    const lockedAsClass = new Set(
      ['CLASS', ...Object.keys(LOCKED_AS)].map((type) => type.toLowerCase()),
    );
    const includes = new Set(
      EMPTIED_INCLUDE_TYPES.map((type) => type.toLowerCase()),
    );
    const allowed = await open(compactToolSet, []);
    const updates = await served(allowed, 'update');
    const deletes = await served(allowed, 'delete');
    for (const type of [...lockedAsClass, ...includes]) {
      assert.ok(updates.includes(type), `update serves ${type}`);
    }
    for (const type of includes) {
      assert.ok(deletes.includes(type), `delete serves ${type}`);
    }
    const denied = await open(compactToolSet, ['HandlerLock.CLASS']);
    const updatesLeft = await served(denied, 'update');
    const deletesLeft = await served(denied, 'delete');
    assert.deepEqual(
      updatesLeft,
      updates.filter((type) => !lockedAsClass.has(type)),
    );
    assert.deepEqual(
      deletesLeft,
      deletes.filter((type) => !includes.has(type)),
    );
    await assertRefused(
      denied,
      'update',
      { object_type: 'local_types', name: 'SOME_CLASS' },
      notServedWords('update', 'local_types', updatesLeft),
    );
    await assertRefused(
      denied,
      'delete',
      { object_type: 'local_types', name: 'SOME_CLASS' },
      notServedWords('delete', 'local_types', deletesLeft),
    );
  });

  for (const [set, family, entry] of [
    [fullToolSet, 'core', 'Create*'],
    [compactToolSet, 'compact', 'HandlerCreate'],
  ] as const) {
    it(`${entry} takes the create prompt out of ${family}`, async () => {
      assert.ok((await names(await open(set, []))).includes('create'));
      const denied = await open(set, [entry]);
      const listed = await names(denied);
      assert.ok(!listed.includes('create'));
      assert.ok(listed.includes('get'));
      await assert.rejects(
        denied.getPrompt({
          name: 'create',
          arguments: { object_type: 'class', name: 'SOME_CLASS' },
        }),
        (error: Error) => {
          assert.ok(error instanceof McpError);
          assert.equal(error.code, ErrorCode.InvalidParams);
          return true;
        },
      );
    });
  }

  it('nothing under src/lib/prompts/ imports from src/lib/access/', () => {
    const directory = path.join(
      repositoryRoot(__dirname),
      'src',
      'lib',
      'prompts',
    );
    const files = fs
      .readdirSync(directory)
      .filter((file) => file.endsWith('.ts'));
    assert.ok(files.length > 5);
    for (const file of files) {
      const text = fs.readFileSync(path.join(directory, file), 'utf8');
      // Every import names its module in quotes: none names a path
      // through access/.
      const importLines = text
        .split('\n')
        .filter(
          (line) =>
            line.startsWith('import ') ||
            line.startsWith('export ') ||
            line.trimStart().startsWith('} from '),
        );
      assert.deepEqual(
        importLines.filter((line) => line.includes('/access/')),
        [],
        file,
      );
    }
  });
});
