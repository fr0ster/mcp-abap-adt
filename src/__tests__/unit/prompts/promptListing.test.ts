/**
 * What each binary lists, read as a client reads it:
 *
 * - **Test 1.** The prompts every binary lists per declared system type
 *   (`onprem`, `cloud`, `legacy`, none) and what their arguments complete
 *   equal `tests/fixtures/tools/listed-prompts.json`. Legacy lists none.
 *   `WRITE_LISTED_PROMPTS=1 npm test -- src/__tests__/unit/prompts/promptListing.test.ts`
 *   writes it first (refused under CI).
 * - **Test 2.** One `prompts/get` per prompt and value of its closed argument
 *   (`object_type`, `transport`'s `action`), on the stdio binary of each
 *   family and kind, and on the Streamable HTTP compact binary for `update`
 *   and the class-include `delete`: the texts equal
 *   `tests/fixtures/tools/prompt-texts.json` (`WRITE_PROMPT_TEXTS=1`), and
 *   every tool a text names is in that binary's `tools/list`.
 * - **Test 6.** Against the ADT stand-in, none of those `prompts/get` and
 *   `completion/complete` calls sends a request.
 * - **Review focus 4.** For every step of every text a stdio binary answers,
 *   what is still to fill is the listed schema's `required` less the
 *   arguments the step fills (and, for a package's unit-test run, the
 *   prompt's own `include_subpackages`, ruling C8).
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { after, before, describe, it, mock } from 'node:test';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getCompleter } from '@modelcontextprotocol/sdk/server/completable.js';
import { resetProcessLatchForTests } from '../../../lib/activeTools';
import { EMPTIED_INCLUDE_TYPES } from '../../../lib/compact/compactSchemas';
import type { ServedTransport } from '../../../lib/config/binaries';
import { abapPrompts } from '../../../lib/prompts/prompts';
import { statedSystemKind } from '../../../lib/systemKind';
import { BINARIES, type ToolSetKind } from '../../../lib/toolSet';
import { type AdtStandIn, adtStandIn } from '../../helpers/adtStandIn';
import {
  type PromptTexts,
  recordText,
  renderListedPrompts,
  renderPromptTexts,
} from '../../helpers/fixtureRenderings';
import {
  closedArgumentOf,
  promptArguments,
  toolsNamed,
} from '../../helpers/promptArguments';
import { promptSourceFor } from '../../helpers/promptSources';
import { askedOf, listedPromptTools } from '../../helpers/promptTools';
import { repositoryRoot } from '../../helpers/repoRoot';
import {
  binaryClient,
  type DeclaredType,
  declare,
  KINDS,
  type ListedPrompt,
  listBinaryPrompts,
  type PromptListing,
  promptsOf,
  toolSets,
} from '../../helpers/servedTools';

const FIXTURES = path.join(
  repositoryRoot(__dirname),
  'tests',
  'fixtures',
  'tools',
);
const LISTED_PROMPTS = path.join(FIXTURES, 'listed-prompts.json');
const PROMPT_TEXTS = path.join(FIXTURES, 'prompt-texts.json');

const LISTED_TYPES: readonly DeclaredType[] = [
  'onprem',
  'cloud',
  'legacy',
  'none',
];
const TEXT_TYPES: readonly DeclaredType[] = ['onprem', 'cloud', 'none'];

/** The class-include types a compact delete writes empty under the class's lock. */
const CLASS_INCLUDES = new Set(
  EMPTIED_INCLUDE_TYPES.map((type) => type.toLowerCase()),
);

/** One binary a text is asked of, and which of its texts. */
interface TextBinary {
  readonly transport: ServedTransport;
  readonly kind: ToolSetKind;
  /** Whether the text of `prompt` for `value` is asked of this binary. */
  readonly asks: (prompt: string, value: string) => boolean;
}

const TEXT_BINARIES: readonly TextBinary[] = [
  ...KINDS.map((kind) => ({
    transport: 'stdio' as const,
    kind,
    asks: () => true,
  })),
  {
    transport: 'http',
    kind: 'compact',
    asks: (prompt, value) =>
      prompt === 'update' || (prompt === 'delete' && CLASS_INCLUDES.has(value)),
  },
];

/** The text of a `prompts/get` answer. */
function textOfAnswer(messages: ReadonlyArray<{ content: { type: string } }>) {
  return messages
    .map(({ content }) =>
      'text' in content && typeof content.text === 'string'
        ? content.text
        : content.type,
    )
    .join('\n');
}

/** What one binary answered for test 2 and review focus 4. */
interface Answered {
  readonly listing: string;
  readonly systemType: DeclaredType;
  readonly transport: ServedTransport;
  readonly kind: ToolSetKind;
  readonly tools: ReadonlyMap<string, readonly string[]>;
  readonly texts: ReadonlyArray<{ key: string; text: string }>;
}

async function answeredBy(
  client: Client,
  binary: TextBinary,
  systemType: DeclaredType,
): Promise<Answered> {
  const tools = new Map<string, readonly string[]>();
  for (const tool of (await client.listTools()).tools) {
    tools.set(tool.name, tool.inputSchema.required ?? []);
  }
  const texts: Array<{ key: string; text: string }> = [];
  for (const listed of await promptsOf(client)) {
    for (const { value, args } of askedOf(listed)) {
      if (!binary.asks(listed.prompt.name, value)) continue;
      const { messages } = await client.getPrompt({
        name: listed.prompt.name,
        arguments: args,
      });
      texts.push({
        key: `${listed.prompt.name} ${value}`,
        text: textOfAnswer(messages),
      });
    }
  }
  return {
    listing: `${systemType} ${BINARIES[binary.transport][binary.kind].bin}`,
    systemType,
    transport: binary.transport,
    kind: binary.kind,
    tools,
    texts,
  };
}

describe('the prompts each binary lists and answers (WRITE_LISTED_PROMPTS=1, WRITE_PROMPT_TEXTS=1 rewrite the fixtures)', () => {
  let standIn: AdtStandIn;
  let listings: PromptListing[] = [];
  const answered: Answered[] = [];
  const texts: PromptTexts = new Map();
  let toolsOf: (listing: PromptListing, prompt: string) => readonly string[] =
    () => [];
  const saved = process.env.SAP_SYSTEM_TYPE;

  before(async () => {
    mock.method(console, 'error', () => {});
    resetProcessLatchForTests();
    standIn = await adtStandIn();
    listings = await listBinaryPrompts(LISTED_TYPES, standIn);
    toolsOf = listedPromptTools(listings);
    for (const systemType of TEXT_TYPES) {
      declare(systemType);
      for (const binary of TEXT_BINARIES) {
        const { client, close } = await binaryClient(
          binary.transport,
          binary.kind,
          standIn,
        );
        try {
          answered.push(await answeredBy(client, binary, systemType));
        } finally {
          await close();
        }
      }
    }
    for (const { listing, texts: each } of answered) {
      for (const { key, text } of each) recordText(texts, key, listing, text);
    }
    for (const [variable, file, rendered] of [
      [
        'WRITE_LISTED_PROMPTS',
        LISTED_PROMPTS,
        renderListedPrompts(listings, toolsOf),
      ],
      ['WRITE_PROMPT_TEXTS', PROMPT_TEXTS, renderPromptTexts(texts)],
    ] as const) {
      if (process.env[variable] === '1') {
        if (process.env.CI) throw new Error(`${variable} is refused under CI`);
        fs.writeFileSync(file, rendered);
      }
    }
  });

  after(async () => {
    await standIn?.close();
    if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = saved;
    resetProcessLatchForTests();
    mock.restoreAll();
  });

  it('test 1: the listing per kind equals listed-prompts.json', () => {
    assert.equal(
      renderListedPrompts(listings, toolsOf),
      fs.readFileSync(LISTED_PROMPTS, 'utf8'),
    );
  });

  it('test 1: every binary is listed on every kind; legacy lists no prompt, the others some', () => {
    for (const systemType of LISTED_TYPES) {
      const of = listings.filter((each) => each.systemType === systemType);
      assert.equal(new Set(of.map(({ bin }) => bin)).size, 12);
      for (const { bin, prompts } of of) {
        if (systemType === 'legacy') assert.deepEqual(prompts, [], bin);
        else assert.ok(prompts.length > 0, `${systemType} ${bin}`);
      }
    }
  });

  it('test 2: the texts equal prompt-texts.json', () => {
    assert.equal(
      renderPromptTexts(texts),
      fs.readFileSync(PROMPT_TEXTS, 'utf8'),
    );
  });

  it('test 2: every text names tools, each listed by its binary', () => {
    const known = new Set(answered.flatMap(({ tools }) => [...tools.keys()]));
    let asked = 0;
    for (const { listing, tools, texts: each } of answered) {
      for (const { key, text } of each) {
        asked += 1;
        const named = toolsNamed(text, known);
        assert.ok(named.length > 0, `${listing} ${key} names a tool`);
        assert.deepEqual(
          named.filter((tool) => !tools.has(tool)),
          [],
          `${listing} ${key}`,
        );
      }
    }
    assert.ok(asked > 1000, `${asked} texts asked`);
  });

  it('test 6: no prompts/get and no completion/complete sends a request', () => {
    assert.deepEqual(standIn.requests, []);
  });

  it('review focus 4: still to fill is the listed required less the filled arguments', async () => {
    let steps = 0;
    for (const { systemType, transport, kind, tools } of answered) {
      if (transport !== 'stdio') continue;
      const set = toolSets.stdio[kind];
      const source = promptSourceFor(
        set,
        statedSystemKind(systemType === 'none' ? undefined : systemType),
        { transport, backgroundRuns: set.backgroundRuns },
      );
      for (const prompt of abapPrompts(source)) {
        const required = Object.entries(prompt.argsSchema)
          .filter(([, schema]) => !schema.safeParse(undefined).success)
          .map(([name]) => name);
        const closed = closedArgumentOf(prompt.name);
        const schema = prompt.argsSchema[closed];
        assert.ok(schema, `${prompt.name} takes ${closed}`);
        const complete = getCompleter(schema);
        assert.ok(complete, `${prompt.name} completes ${closed}`);
        const values = await complete('', { arguments: {} });
        for (const value of values.filter((each) => each !== undefined)) {
          const instruction = prompt.instruction(
            promptArguments(prompt.name, value, required),
          );
          for (const [index, step] of instruction.steps.entries()) {
            steps += 1;
            const listed = tools.get(step.tool);
            assert.ok(listed, `${kind} lists ${step.tool}`);
            const filled = new Set(step.arguments.map(([name]) => name));
            // Ruling C8: a package's run (the first step) lists the prompt's
            // own include_subpackages still to fill while the user gave none.
            // A function module's name waits for the prompt's own
            // function_group where its tool's form carries the group.
            const awaitsGroup = step.arguments.some(
              ([, argument]) =>
                argument.from === 'model' &&
                argument.awaits?.name === 'function_group',
            );
            const promptLevel = [
              ...(prompt.name === 'unit_test' &&
              value === 'package' &&
              index === 0
                ? ['include_subpackages']
                : []),
              ...(awaitsGroup ? ['function_group'] : []),
            ];
            assert.deepEqual(
              step.stillToFill.map(({ name }) => name),
              [...listed.filter((name) => !filled.has(name)), ...promptLevel],
              `${systemType} ${kind} ${prompt.name} ${closed}=${value}: ${step.tool}`,
            );
          }
        }
      }
    }
    assert.ok(steps > 1000, `${steps} steps checked`);
  });
});
