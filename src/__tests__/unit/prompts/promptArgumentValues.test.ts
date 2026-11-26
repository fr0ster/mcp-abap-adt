/**
 * A client without `completion/complete` reads a closed prompt argument's
 * values in its description: on every binary and declared system type, and
 * with `--deny-actions` applied as a launcher applies it, each closed
 * argument's description ends with exactly the values its completion
 * offers, in their order. The argument a user picks (`object_type`, the
 * transport `action`) is optional: a `prompts/get` without it, or with a
 * value the binary does not serve (unknown, or denied), answers no error
 * but one line listing exactly those values, the model told to ask.
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
import {
  binaryClient,
  type DeclaredType,
  declare,
  KINDS,
  type ListedPrompt,
  listBinaryPrompts,
  type PromptListing,
  promptsOf,
} from '../../helpers/servedTools';

/** The argument a user picks from, per prompt. */
const picked = (prompt: string): 'action' | 'object_type' =>
  prompt === 'transport' ? 'action' : 'object_type';

/** The one text message of a `prompts/get` answer. */
function textOfAnswer(
  messages: ReadonlyArray<{ content: { type: string } }>,
): string {
  assert.equal(messages.length, 1);
  const [message] = messages;
  // An answer over the wire: its content is read as the protocol gives it.
  const content = message?.content;
  assert.ok(content && 'text' in content && typeof content.text === 'string');
  return content.text;
}

/**
 * On `client`, `listed` answered with its picked argument absent, blank and
 * set to `value`, every other argument it lists as required given: each a
 * text naming it and listing exactly its completion's values. Answers the
 * number of answers checked.
 */
async function assertAskedOver(
  client: Client,
  listed: ListedPrompt,
  where: string,
  value = 'not_served_here',
): Promise<number> {
  const { name } = listed.prompt;
  const argument = picked(name);
  const values = listed.completions[argument] ?? [];
  assert.ok(values.length > 0, `${where} ${name} completes ${argument}`);
  const required: Record<string, string> = Object.fromEntries(
    (listed.prompt.arguments ?? [])
      .filter((each) => each.required === true && each.name !== argument)
      .map((each) => [each.name, `SOME_${each.name.toUpperCase()}`]),
  );
  assert.equal(
    (listed.prompt.arguments ?? []).find((each) => each.name === argument)
      ?.required,
    false,
    `${where} ${name} ${argument} is optional`,
  );
  const rest = `The ${name} prompt takes: ${values.join(', ')}. Ask the user which one they want, then call it again.`;
  const cases: ReadonlyArray<readonly [Record<string, string>, string]> = [
    [required, `No ${argument} was given. ${rest}`],
    [{ ...required, [argument]: ' ' }, `No ${argument} was given. ${rest}`],
    [
      { ...required, [argument]: value },
      `The ${argument} ${JSON.stringify(value)} is not served by this server. ${rest}`,
    ],
  ];
  for (const [args, expected] of cases) {
    const { messages } = await client.getPrompt({ name, arguments: args });
    assert.equal(
      textOfAnswer(messages),
      expected,
      `${where} ${name} ${JSON.stringify(args)}`,
    );
  }
  return cases.length;
}

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
    [fullToolSet, 'core', 'GetProgram', 'get', 'object_type', 'program'],
    [fullToolSet, 'core', 'UpdateProgram', 'update', 'object_type', 'program'],
    [fullToolSet, 'core', 'DeleteProgram', 'delete', 'object_type', 'program'],
    [
      fullToolSet,
      'core',
      'ActivateProgram',
      'activate',
      'object_type',
      'program',
    ],
    [fullToolSet, 'core', 'CheckProgram', 'check', 'object_type', 'program'],
    [
      fullToolSet,
      'core',
      'RunProgramUnitTest',
      'unit_test',
      'object_type',
      'program',
    ],
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
      await assertAskedOver(client, listed, `${family} denied ${denied}`, gone);
    });
  }

  it('a picked argument absent, blank or not served asks the user, on every stdio binary and kind', async () => {
    let answers = 0;
    for (const systemType of LISTED_TYPES) {
      declare(systemType);
      for (const kind of KINDS) {
        const { client, close } = await binaryClient('stdio', kind, standIn);
        try {
          for (const listed of await promptsOf(client)) {
            answers += await assertAskedOver(
              client,
              listed,
              `${systemType} ${kind}`,
            );
          }
        } finally {
          await close();
        }
      }
    }
    assert.ok(answers > 200, `${answers} answers checked`);
  });
});
