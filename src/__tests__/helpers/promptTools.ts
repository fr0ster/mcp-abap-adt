/**
 * The tools each listed prompt's steps call, read from the instruction data
 * of the prompts the binary's tool set builds in process — never from a
 * description or a text. `listed-prompts.json` carries them as `tools`, and
 * the tool pages' prompt pointers are generated from them.
 */
import assert from 'node:assert/strict';
import { abapPrompts } from '../../lib/prompts/prompts';
import type { AbapPrompt } from '../../lib/prompts/types';
import { statedSystemKind } from '../../lib/systemKind';
import { closedArgumentOf, promptArguments } from './promptArguments';
import { promptSourceFor } from './promptSources';
import { type ListedPrompt, type PromptListing, toolSets } from './servedTools';

/** The arguments `listed` lists as required. */
const requiredOf = (listed: ListedPrompt): string[] =>
  (listed.prompt.arguments ?? [])
    .filter(({ required }) => required === true)
    .map(({ name }) => name);

/** Every `<value, arguments>` a listed prompt is asked for: one per value its closed argument completes. */
export function askedOf(listed: ListedPrompt) {
  const name = listed.prompt.name;
  const values = listed.completions[closedArgumentOf(name)] ?? [];
  return values.map((value) => ({
    value,
    args: promptArguments(name, value, requiredOf(listed)),
  }));
}

/** The prompts `listing`'s tool set builds in process on its kind, by name. */
function builtPrompts(listing: PromptListing): ReadonlyMap<string, AbapPrompt> {
  const set = toolSets[listing.transport][listing.kind];
  const source = promptSourceFor(
    set,
    statedSystemKind(
      listing.systemType === 'none' ? undefined : listing.systemType,
    ),
    { transport: listing.transport, backgroundRuns: set.backgroundRuns },
  );
  return new Map(abapPrompts(source).map((each) => [each.name, each]));
}

/**
 * Per listing, prompt name -> the tools its steps call over every value it
 * is asked for, sorted; as the function `renderListedPrompts` reads.
 */
export function listedPromptTools(
  listings: readonly PromptListing[],
): (listing: PromptListing, prompt: string) => readonly string[] {
  const byListing = new Map<PromptListing, Map<string, readonly string[]>>();
  for (const listing of listings) {
    const byName = new Map<string, readonly string[]>();
    byListing.set(listing, byName);
    if (listing.prompts.length === 0) continue;
    const built = builtPrompts(listing);
    for (const listed of listing.prompts) {
      const prompt = built.get(listed.prompt.name);
      assert.ok(prompt, `${listing.bin} builds ${listed.prompt.name}`);
      const tools = new Set<string>();
      for (const { args } of askedOf(listed)) {
        for (const step of prompt.instruction(args).steps) tools.add(step.tool);
      }
      byName.set(listed.prompt.name, [...tools].sort());
    }
  }
  return (listing, prompt) => {
    const tools = byListing.get(listing)?.get(prompt);
    assert.ok(tools, `${listing.bin} lists ${prompt}`);
    return tools;
  };
}
